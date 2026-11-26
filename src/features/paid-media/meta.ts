import "server-only";
import { z } from "zod";
import {
  identifiers,
  type Ad,
  type CreativeAsset,
  type CreativePreview,
  type Insight,
  type Account,
  type MetaAccountAnalytics,
  type MetaSegment,
} from "./model";

const accountSchema = z.object({
  id: identifiers.account,
  name: z.string().min(1).max(512),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone_name: z.string().min(1).max(100),
});
export type MetaAccount = z.infer<typeof accountSchema>;
export type MetaAccess = { token: string; version: string };
const actionSchema = z
  .array(
    z.object({ action_type: z.string(), value: z.string().or(z.number()) }),
  )
  .optional();
const insightSchema = z.object({
  date_start: z.iso.date(),
  campaign_id: identifiers.entity,
  campaign_name: z.string().max(512),
  ad_id: identifiers.entity,
  ad_name: z.string().max(512),
  spend: z.coerce.number().finite().nonnegative(),
  impressions: z.coerce.number().int().nonnegative(),
  actions: actionSchema,
  video_thruplay_watched_actions: actionSchema,
});
const creativeSchema = z.object({
  id: identifiers.entity,
  name: z.string().max(512).optional(),
  campaign_id: identifiers.entity,
  adset: z.object({ destination_type: z.string().optional() }).optional(),
  creative: z
    .object({
      id: identifiers.entity,
      thumbnail_url: z.string().max(4000).optional(),
      body: z.string().max(10000).optional(),
    })
    .optional(),
});
export class MetaError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
const metaErrorNumber = z.number().int().positive().max(2147483647);
const metaFailure = z.object({
  code: metaErrorNumber.optional(),
  error_subcode: metaErrorNumber.optional(),
  message: z.string().optional(),
});

async function graph<T>(
  { token, version }: MetaAccess,
  path: string,
  options: Record<string, string>,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.search = new URLSearchParams(options).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch {
    throw new MetaError(
      "A Meta não respondeu dentro da janela de sincronização.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const reason = metaFailure.safeParse(body?.error).data;
    const code = reason?.code ?? 0;
    const subcode = reason?.error_subcode;
    const detail = code
      ? ` (código Meta ${code}${subcode ? `/${subcode}` : ""})`
      : "";
    if (code === 190)
      throw new MetaError(
        `A Meta rejeitou a credencial${detail}. Ela pode estar inválida, expirada ou revogada.`,
        503,
      );
    if (response.status === 429 || [4, 17, 32, 613].includes(code))
      throw new MetaError(
        "A Meta limitou as consultas. Aguarde e tente novamente.",
        503,
      );
    if (
      code === 12 ||
      code === 2635 ||
      /\b(?:unsupported|deprecated)\b.*\bversion\b/i.test(reason?.message ?? "")
    )
      throw new MetaError(
        `A Meta recusou a versão ${version} usada pelo servidor${detail}.`,
      );
    if (/appsecret_proof/i.test(reason?.message ?? ""))
      throw new MetaError(
        `O aplicativo na Meta exige a configuração de app secret proof${detail}.`,
      );
    if (code === 10 || (code >= 200 && code < 300) || response.status === 403)
      throw new MetaError(
        `A Meta negou a leitura das contas de anúncio${detail}. Confira o acesso às contas e a permissão ads_read.`,
        403,
      );
    throw new MetaError(
      `A Meta recusou a consulta de anúncios${detail}. A integração usou a versão ${version}.`,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new MetaError(
      "A resposta da Meta não corresponde ao formato esperado.",
    );
  return parsed.data;
}
async function pages<T>(
  access: MetaAccess,
  path: string,
  query: Record<string, string>,
  row: z.ZodType<T>,
  signal: AbortSignal,
  maxPages = 20,
) {
  const schema = z.object({
    data: z.array(row),
    paging: z
      .object({
        next: z.string().optional(),
        cursors: z.object({ after: z.string().optional() }).optional(),
      })
      .optional(),
  });
  const rows: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await graph(
      access,
      path,
      { ...query, limit: "250", ...(after ? { after } : {}) },
      schema,
      signal,
    );
    rows.push(...result.data);
    if (!result.paging?.next) return rows;
    const cursor =
      result.paging.cursors?.after ??
      new URL(result.paging.next).searchParams.get("after") ??
      undefined;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  throw new MetaError(
    "A conta retornou páginas demais para uma importação. Reduza o período.",
    422,
  );
}
export const discoverMetaAccounts = (access: MetaAccess) =>
  pages(
    access,
    "me/adaccounts",
    { fields: "id,name,currency,timezone_name" },
    accountSchema,
    AbortSignal.timeout(25000),
  );
export const getMetaAccount = (access: MetaAccess, id: string) =>
  graph(
    access,
    id,
    { fields: "id,name,currency,timezone_name" },
    accountSchema,
    AbortSignal.timeout(15000),
  );

export async function validateMetaAccess(access: MetaAccess) {
  const { data } = await graph(
    access,
    "me/adaccounts",
    { fields: "id", limit: "1" },
    z.object({ data: z.array(z.object({ id: identifiers.account })) }),
    AbortSignal.timeout(15_000),
  );
  if (!data.length)
    throw new MetaError(
      "O token não tem acesso a nenhuma conta de anúncios na Meta.",
      422,
    );
}

function count(actions: z.infer<typeof actionSchema>, types: string[]) {
  for (const type of types) {
    const match = actions?.find((a) => a.action_type === type);
    if (!match) continue;
    const value = Number(match.value);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}

const numberField = z.union([z.string(), z.number()]).nullish();
const deliverySchema = z.object({
  spend: numberField,
  impressions: numberField,
  reach: numberField,
  inline_link_clicks: numberField,
  actions: actionSchema,
});
const breakdownSchema = deliverySchema.extend({
  publisher_platform: z.string().optional(),
  platform_position: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
});
function metaNumber(value: z.infer<typeof numberField>) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function groupSegments(
  rows: z.infer<typeof breakdownSchema>[],
  keyFor: (row: z.infer<typeof breakdownSchema>) => string,
) {
  const sums = new Map<string, MetaSegment>();
  for (const row of rows) {
    const key = keyFor(row);
    const raw = {
      spend: metaNumber(row.spend),
      impressions: metaNumber(row.impressions),
      linkClicks: metaNumber(row.inline_link_clicks),
      formLeads: count(row.actions, ["onsite_conversion.lead_grouped"]),
    };
    const sum = sums.get(key) ?? {
      key,
      spend: null,
      impressions: null,
      linkClicks: null,
      formLeads: null,
    };
    for (const metric of [
      "spend",
      "impressions",
      "linkClicks",
      "formLeads",
    ] as const) {
      const value = raw[metric];
      if (value !== null) sum[metric] = (sum[metric] ?? 0) + value;
    }
    sums.set(key, sum);
  }
  return [...sums.values()];
}

async function readMetaBilling(
  access: MetaAccess,
  account: Account,
  signal: AbortSignal,
) {
  const row = await graph(
    access,
    account.account_id,
    { fields: "spend_cap,amount_spent" },
    z.object({ spend_cap: numberField, amount_spent: numberField }),
    signal,
  );
  const cap = metaNumber(row.spend_cap);
  const charged = metaNumber(row.amount_spent);
  // Ad account amounts are in minor currency units, unlike Insights spend.
  const decimals =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: account.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const unit = 10 ** decimals;
  return {
    spendLimit: cap ? cap / unit : null,
    remainingLimit:
      cap && charged !== null ? Math.max(0, cap - charged) / unit : null,
  };
}

export async function fetchMetaAnalytics(
  access: MetaAccess,
  account: Account,
  range: { from: string; to: string },
  campaignIds: string[] | null,
  billing: boolean,
  signal: AbortSignal,
): Promise<MetaAccountAnalytics> {
  const query = {
    time_range: JSON.stringify({ since: range.from, until: range.to }),
    level: "account",
    ...(campaignIds
      ? {
          filtering: JSON.stringify([
            { field: "campaign.id", operator: "IN", value: campaignIds },
          ]),
        }
      : {}),
  };
  const path = `${account.account_id}/insights`;
  const segments = async (breakdowns: string) => {
    const fields = "spend,impressions,inline_link_clicks";
    try {
      return await pages(
        access,
        path,
        { ...query, breakdowns, fields: fields + ",actions" },
        breakdownSchema,
        signal,
      );
    } catch (error) {
      if (
        signal.aborted ||
        !(error instanceof MetaError) ||
        error.status !== 502
      )
        throw error;
      // Some accounts allow delivery breakdowns while withholding action breakdowns.
      return pages(
        access,
        path,
        { ...query, breakdowns, fields },
        breakdownSchema,
        signal,
      );
    }
  };
  const hasCampaigns = campaignIds === null || campaignIds.length > 0;
  const [deliveryRows, placementRows, demographicRows, limit] =
    await Promise.allSettled([
      hasCampaigns
        ? graph(
            access,
            path,
            {
              ...query,
              fields: "spend,impressions,reach,inline_link_clicks,actions",
            },
            z.object({ data: z.array(deliverySchema) }),
            signal,
          )
        : null,
      hasCampaigns ? segments("publisher_platform,platform_position") : null,
      hasCampaigns ? segments("age,gender") : null,
      billing ? readMetaBilling(access, account, signal) : null,
    ]);
  const row =
    deliveryRows.status === "fulfilled" ? deliveryRows.value?.data[0] : null;
  const placement =
    placementRows.status === "fulfilled" ? placementRows.value : null;
  const demographics =
    demographicRows.status === "fulfilled" ? demographicRows.value : null;
  return {
    accountId: account.account_id,
    delivery: row
      ? {
          spend: metaNumber(row.spend),
          impressions: metaNumber(row.impressions),
          reach: metaNumber(row.reach),
          linkClicks: metaNumber(row.inline_link_clicks),
          engagement: count(row.actions, ["post_engagement"]),
        }
      : null,
    placements:
      placement &&
      groupSegments(
        placement,
        (value) =>
          [value.publisher_platform, value.platform_position]
            .filter(Boolean)
            .join(":") || "unknown",
      ),
    ages:
      demographics &&
      groupSegments(demographics, (value) => value.age ?? "unknown"),
    genders:
      demographics &&
      groupSegments(demographics, (value) => value.gender ?? "unknown"),
    billing: limit.status === "fulfilled" ? limit.value : null,
  };
}
function safeThumbnail(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /(^|\.)(fbcdn\.net|facebook\.com|cdninstagram\.com)$/i.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function fetchMetaSnapshot(
  access: MetaAccess,
  account: string,
  from: string,
  to: string,
) {
  const signal = AbortSignal.timeout(42000);
  const [rows, creatives] = await Promise.all([
    pages(
      access,
      `${account}/insights`,
      {
        time_range: JSON.stringify({ since: from, until: to }),
        time_increment: "1",
        level: "ad",
        fields:
          "date_start,campaign_id,campaign_name,ad_id,ad_name,spend,impressions,actions,video_thruplay_watched_actions",
      },
      insightSchema,
      signal,
    ),
    pages(
      access,
      `${account}/ads`,
      {
        fields:
          "id,name,campaign_id,adset{destination_type},creative{id,thumbnail_url,body}",
      },
      creativeSchema,
      signal,
    ),
  ]);
  const catalog = new Map(creatives.map((ad) => [ad.id, ad]));
  const campaigns = new Map<string, { campaign_id: string; name: string }>();
  const ads = new Map<string, Ad>();
  const insights: Insight[] = [];
  for (const row of rows) {
    campaigns.set(row.campaign_id, {
      campaign_id: row.campaign_id,
      name: row.campaign_name,
    });
    const creative = catalog.get(row.ad_id)?.creative;
    ads.set(row.ad_id, {
      ad_id: row.ad_id,
      campaign_id: row.campaign_id,
      name: row.ad_name,
      creative_id: creative?.id ?? null,
      thumbnail: safeThumbnail(creative?.thumbnail_url),
      copy: creative?.body ?? null,
    });
    insights.push({
      day: row.date_start,
      ad_id: row.ad_id,
      spend: row.spend,
      impressions: row.impressions,
      form_leads: count(row.actions, ["onsite_conversion.lead_grouped"]),
      whatsapp_conversations:
        catalog.get(row.ad_id)?.adset?.destination_type === "WHATSAPP"
          ? count(row.actions, [
              "onsite_conversion.messaging_conversation_started_7d",
            ])
          : null,
      profile_visits: count(row.actions, [
        "onsite_conversion.instagram_profile_visit",
        "instagram_profile_visit",
      ]),
      thruplays: count(row.video_thruplay_watched_actions, [
        "video_view",
        "thruplay",
      ]),
    });
  }
  return {
    campaigns: [...campaigns.values()],
    ads: [...ads.values()],
    insights,
  };
}

const mediaDescriptor = z.object({
  hash: z.string().optional(),
  video_id: z.string().or(z.number()).optional(),
  url: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
});
const assetRow = deliverySchema.extend({
  ad_id: identifiers.entity,
  campaign_id: identifiers.entity,
  ad_name: z.string(),
  image_asset: mediaDescriptor.nullish(),
  video_asset: mediaDescriptor.nullish(),
});

function publicVideoUrl(value: string | null | undefined) {
  if (!value || !URL.canParse(value)) return;
  const url = new URL(value);
  if (url.protocol === "https:" && !url.username && !url.password &&
      !url.searchParams.has("access_token")) return url.href;
}

export async function readCreativeAssets(
  access: MetaAccess,
  account: string,
  campaigns: string[],
  range: { from: string; to: string },
) {
  const assets = new Map<string, CreativeAsset>();
  const signal = AbortSignal.timeout(50000);
  const allowed = new Set(campaigns);
  const adPreviews: Record<string, CreativePreview> = {};
  const hashes = new Map<string, CreativePreview[]>();
  const videos = new Map<string, CreativePreview[]>();
  const warnings = new Set<string>();
  for (let offset = 0; offset < campaigns.length; offset += 100) {
    const filtering = JSON.stringify([
      {
        field: "campaign.id",
        operator: "IN",
        value: campaigns.slice(offset, offset + 100),
      },
    ]);
    await Promise.all(
      (["image", "video"] as const).map(async (type) => {
        const breakdown = type === "image" ? "image_asset" : "video_asset";
        for (const historical of [false, true]) {
          const period: Record<string, string> = historical
            ? { date_preset: "maximum" }
            : {
                time_range: JSON.stringify({
                  since: range.from,
                  until: range.to,
                }),
              };
          let rows;
          try {
            rows = await pages(
              access,
              account + "/insights",
              {
                ...period,
                level: "ad",
                breakdowns: breakdown,
                filtering,
                fields: historical
                  ? "ad_id,campaign_id,ad_name"
                  : "ad_id,campaign_id,ad_name,impressions,spend,inline_link_clicks,actions",
              },
              assetRow,
              signal,
              Infinity,
            );
          } catch (error) {
            warnings.add(
              `${breakdown} (${historical ? "histórico" : "período"}): ${error instanceof MetaError ? error.message : "consulta indisponível"}`,
            );
            // Without the period breakdown, historical rows cannot be called inactive.
            if (!historical) break;
            continue;
          }
          for (const row of rows) {
            if (!allowed.has(row.campaign_id)) continue;
            const descriptor = row[breakdown];
            const id =
              type === "image" ? descriptor?.hash : descriptor?.video_id;
            if (!descriptor || !id) continue;
            const key = [row.ad_id, type, id].join(":");
            const preview = descriptor.url || descriptor.thumbnail_url || null;
            const existing = assets.get(key);
            if (existing) {
              existing.preview ||= preview;
              continue;
            }
            const asset: CreativeAsset = {
              key,
              type,
              adId: row.ad_id,
              campaignId: row.campaign_id,
              name: row.ad_name,
              preview,
              ...(type === "video" ? { videoId: String(id) } : {}),
              metrics: historical
                ? null
                : {
                    spend: metaNumber(row.spend),
                    impressions: metaNumber(row.impressions),
                    clicks: metaNumber(row.inline_link_clicks),
                    leads: count(row.actions, [
                      "onsite_conversion.lead_grouped",
                    ]),
                    conversations: count(row.actions, [
                      "onsite_conversion.messaging_conversation_started_7d",
                    ]),
                  },
            };
            assets.set(key, asset);
            const index = type === "image" ? hashes : videos;
            const group = index.get(String(id)) ?? [];
            group.push(asset);
            index.set(String(id), group);
          }
        }
      }),
    );
    try {
      const catalog = await pages(
        access,
        account + "/ads",
        {
          filtering,
          fields:
            "id,campaign_id,creative{image_hash,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec}",
        },
        z.object({
          id: identifiers.entity,
          campaign_id: identifiers.entity,
          creative: z
            .object({
              image_hash: z.string().nullish(),
              image_url: z.string().nullish(),
              thumbnail_url: z.string().nullish(),
              video_id: z.string().nullish(),
              object_story_spec: z
                .object({
                  video_data: z
                    .object({
                      video_id: z.string().optional(),
                      image_url: z.string().optional(),
                    })
                    .nullish(),
                  link_data: z
                    .object({
                      image_hash: z.string().optional(),
                      picture: z.string().optional(),
                    })
                    .nullish(),
                })
                .nullish(),
              asset_feed_spec: z
                .object({
                  images: z
                    .array(z.object({ hash: z.string().optional() }))
                    .optional(),
                  videos: z
                    .array(z.object({ video_id: z.string().optional() }))
                    .optional(),
                })
                .nullish(),
            })
            .nullish(),
        }),
        signal,
        Infinity,
      );
      for (const ad of catalog) {
        if (!allowed.has(ad.campaign_id) || !ad.creative) continue;
        const c = ad.creative;
        const video = c.object_story_spec?.video_data;
        const link = c.object_story_spec?.link_data;
        const videoId =
          c.video_id ||
          video?.video_id ||
          c.asset_feed_spec?.videos?.[0]?.video_id;
        const hash =
          c.image_hash ||
          link?.image_hash ||
          c.asset_feed_spec?.images?.[0]?.hash;
        const media: CreativePreview = {
          preview:
            c.image_url ||
            video?.image_url ||
            link?.picture ||
            c.thumbnail_url ||
            null,
        };
        adPreviews[ad.id] = media;
        if (videoId) {
          media.videoId = videoId;
          const group = videos.get(videoId) ?? [];
          group.push(media);
          videos.set(videoId, group);
        } else if (hash) {
          const group = hashes.get(hash) ?? [];
          group.push(media);
          hashes.set(hash, group);
        }
      }
    } catch {
      warnings.add("Algumas prévias de anúncio podem ter resolução reduzida.");
    }
  }
  const ids = [...hashes.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const images = await pages(
        access,
        account + "/adimages",
        {
          hashes: JSON.stringify(ids.slice(i, i + 50)),
          fields: "hash,url,url_128",
        },
        z.object({
          hash: z.string(),
          url: z.string().nullish(),
          url_128: z.string().nullish(),
        }),
        signal,
        Infinity,
      );
      for (const image of images)
        for (const asset of hashes.get(image.hash) ?? [])
          asset.preview = image.url || asset.preview || image.url_128 || null;
    } catch {
      warnings.add("Algumas imagens originais estão indisponíveis.");
    }
  }
  const videoGroups = [...videos];
  for (let start = 0; start < videoGroups.length; start += 6) {
    await Promise.all(
      videoGroups.slice(start, start + 6).map(async ([id, group]) => {
        try {
          const video = await graph(
            access,
            id,
            { fields: "source,picture" },
            z.object({
              source: z.string().nullish(),
              picture: z.string().nullish(),
            }),
            signal,
          );
          const source = publicVideoUrl(video.source);
          const poster = publicVideoUrl(video.picture);
          for (const media of group) {
            if (source) media.source = source;
            if (poster) media.preview = poster;
          }
        } catch {
          /* The embedded Meta player can still serve public videos. */
        }
      }),
    );
  }
  return { assets: [...assets.values()], adPreviews, warnings: [...warnings] };
}

export async function readAdPlayer(access: MetaAccess, adId: string) {
  const result = await graph(access, adId + "/previews",
    { ad_format: "MOBILE_FEED_STANDARD", fields: "body" },
    z.object({ data: z.array(z.object({ body: z.string() })) }),
    AbortSignal.timeout(15000));
  for (const { body } of result.data) {
    const tag = body.match(/<iframe\b[^>]*>/i)?.[0];
    const src = tag?.match(/\ssrc\s*=\s*(["'])(.*?)\1/i)?.[2].replace(/&amp;/gi, "&");
    if (!src || !URL.canParse(src)) continue;
    const url = new URL(src);
    if (url.origin === "https://www.facebook.com" && !url.username && !url.password &&
        url.pathname === "/ads/api/preview_iframe.php" && !url.searchParams.has("access_token")) {
      return { src: url.href };
    }
  }
  throw new MetaError("A Meta não disponibilizou a prévia deste anúncio.", 422);
}
