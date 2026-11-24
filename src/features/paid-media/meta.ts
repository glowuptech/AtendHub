import "server-only";
import { z } from "zod";
import { identifiers, type Ad, type Insight } from "./model";

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
  for (let page = 0; page < 20; page++) {
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
