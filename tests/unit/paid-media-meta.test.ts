import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  discoverMetaAccounts,
  readCreativeAssets,
  fetchMetaSnapshot,
  fetchMetaAnalytics,
  validateMetaAccess,
} from "@/features/paid-media/meta";

afterEach(() => {
  vi.unstubAllGlobals();
});
const access = { token: "meta-test-token", version: "v99.0" };
it("identifica uma versão recusada sem expor a mensagem enviada pelo provedor", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 2635,
            error_subcode: 12,
            message: `Deprecated version for token ${access.token}`,
          },
        },
        { status: 400 },
      ),
    ),
  );
  await expect(validateMetaAccess(access)).rejects.toThrow(
    "A Meta recusou a versão v99.0 usada pelo servidor (código Meta 2635/12).",
  );
});
it("follows cursors on Meta only", async () => {
  const account = {
    id: "act_11",
    name: "Conta",
    currency: "BRL",
    timezone_name: "America/Sao_Paulo",
  };
  const graph = vi.fn((url: URL, options: RequestInit) => {
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(options.headers).toEqual({
      Authorization: "Bearer meta-test-token",
    });
    if (url.searchParams.has("after"))
      return Promise.resolve(
        Response.json({ data: [{ ...account, id: "act_12" }] }),
      );
    return Promise.resolve(
      Response.json({
        data: [account],
        paging: { next: "https://other.example/?after=cursor" },
      }),
    );
  });
  vi.stubGlobal("fetch", graph);
  expect((await discoverMetaAccounts(access)).map((a) => a.id)).toEqual([
    "act_11",
    "act_12",
  ]);
});
it("counts forms and WhatsApp only from matching provider data, with missing metrics kept null", async () => {
  const base = {
    date_start: "2026-11-20",
    campaign_id: "10",
    campaign_name: "[ACA] Campanha",
    ad_name: "Criativo",
    spend: "10.25",
    impressions: "250",
    actions: [
      { action_type: "onsite_conversion.lead_grouped", value: "2" },
      { action_type: "lead", value: "30" },
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: "4",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      Response.json({
        data: url.pathname.endsWith("/insights")
          ? [
              { ...base, ad_id: "21" },
              { ...base, ad_id: "22" },
            ]
          : [
              {
                id: "21",
                campaign_id: "10",
                adset: { destination_type: "WHATSAPP" },
              },
              {
                id: "22",
                campaign_id: "10",
                adset: { destination_type: "MESSENGER" },
              },
            ],
      }),
    ),
  );
  const result = await fetchMetaSnapshot(
    access,
    "act_1",
    "2026-11-20",
    "2026-11-20",
  );
  expect(result.insights).toMatchObject([
    {
      spend: 10.25,
      form_leads: 2,
      whatsapp_conversations: 4,
      profile_visits: null,
    },
    {
      spend: 10.25,
      form_leads: 2,
      whatsapp_conversations: null,
      profile_visits: null,
    },
  ]);
});

const account = {
  account_id: "act_12",
  name: "Conta",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  shared: true,
};
const range = { from: "2026-11-20", to: "2026-11-21" };

it("busca os recortes da Meta com o mesmo filtro de campanhas e calcula o limite em BRL", async () => {
  const graph = vi.fn(async (url: URL) => {
    if (!url.pathname.endsWith("/insights")) {
      expect(url.searchParams.get("fields")).toBe("spend_cap,amount_spent");
      return Response.json({ spend_cap: "100000", amount_spent: "25000" });
    }
    expect(url.searchParams.get("time_range")).toBe(
      JSON.stringify({ since: range.from, until: range.to }),
    );
    expect(JSON.parse(url.searchParams.get("filtering")!)).toEqual([
      { field: "campaign.id", operator: "IN", value: ["10"] },
    ]);
    switch (url.searchParams.get("breakdowns")) {
      case "age,gender":
        return Response.json({
          data: [
            { age: "25-34", gender: "female", impressions: "30" },
            { age: "25-34", gender: "male", impressions: "20" },
            { age: "35-44", gender: "female", impressions: "50" },
          ],
        });
      case "publisher_platform,platform_position":
        if (url.searchParams.get("fields")?.includes("actions"))
          return Response.json({ error: { code: 100 } }, { status: 400 });
        return Response.json({
          data: [
            {
              publisher_platform: "facebook",
              platform_position: "feed",
              impressions: "100",
            },
          ],
        });
      default:
        return Response.json({
          data: [
            {
              spend: "40",
              impressions: "100",
              reach: "60",
              inline_link_clicks: "20",
              actions: [{ action_type: "post_engagement", value: "15" }],
            },
          ],
        });
    }
  });
  vi.stubGlobal("fetch", graph);
  const result = await fetchMetaAnalytics(
    access,
    account,
    range,
    ["10"],
    true,
    AbortSignal.timeout(1_000),
  );
  expect(result.delivery).toEqual({
    spend: 40,
    impressions: 100,
    reach: 60,
    linkClicks: 20,
    engagement: 15,
  });
  expect(result.ages).toMatchObject([
    { key: "25-34", impressions: 50 },
    { key: "35-44", impressions: 50 },
  ]);
  expect(result.genders).toMatchObject([
    { key: "female", impressions: 80 },
    { key: "male", impressions: 20 },
  ]);
  expect(result.placements).toMatchObject([
    { key: "facebook:feed", impressions: 100, formLeads: null },
  ]);
  expect(result.billing).toEqual({ spendLimit: 1000, remainingLimit: 750 });
  graph.mockClear();
  const noCampaigns = await fetchMetaAnalytics(
    access,
    account,
    range,
    [],
    false,
    AbortSignal.timeout(1_000),
  );
  expect(graph).not.toHaveBeenCalled();
  expect(noCampaigns).toEqual({
    accountId: "act_12",
    delivery: null,
    ages: null,
    genders: null,
    placements: null,
    billing: null,
  });
});

it("separa as peças paginadas, preserva o histórico e isola arquivos reutilizados por anúncio", async () => {
  const base = { campaign_id: "1", ad_id: "21", ad_name: "Anúncio A" };
  const photo = {
    ...base,
    image_asset: { hash: "hash-a" },
    spend: "8",
    impressions: "40",
    inline_link_clicks: "3",
    actions: [{ action_type: "onsite_conversion.lead_grouped", value: "1" }],
  };
  vi.stubGlobal("fetch", async (url: URL) => {
    const q = url.searchParams;
    if (url.pathname.endsWith("/ads"))
      return Response.json({
        data: [
          { id: "24", campaign_id: "1", creative: { image_hash: "hash-a" } },
          { id: "25", campaign_id: "1", creative: { video_id: "123" } },
        ],
      });
    if (url.pathname.endsWith("/123"))
      return Response.json({
        source: "https://example.org/video.mp4",
        thumbnails: {
          data: [
            {
              uri: "https://example.org/vertical.jpg",
              width: 1080,
              height: 1920,
            },
          ],
        },
      });
    if (url.pathname.endsWith("/adimages"))
      return Response.json({
        data: [{ hash: "hash-a", url: "https://example.org/full.jpg" }],
      });
    const video = q.get("breakdowns") === "video_asset";
    if (q.has("date_preset"))
      return Response.json({
        data: video ? [] : [photo, { ...base, image_asset: { hash: "old" } }],
      });
    expect(JSON.parse(q.get("time_range")!)).toEqual({
      since: "2026-11-01",
      until: "2026-11-10",
    });
    if (video)
      return Response.json({
        data: [
          {
            ...base,
            video_asset: {
              video_id: "123",
              thumbnail_url: "https://example.org/cover.jpg",
            },
            spend: "2",
            impressions: "10",
          },
        ],
      });
    if (q.has("after"))
      return Response.json({
        data: [{ ...photo, ad_id: "22", ad_name: "Anúncio B", spend: "4" }],
      });
    return Response.json({
      data: [photo],
      paging: { next: "https://graph.facebook.com/?after=2" },
    });
  });
  const { assets, warnings, adPreviews } = await readCreativeAssets(
    access,
    "act_11",
    ["1"],
    { from: "2026-11-01", to: "2026-11-10" },
  );
  expect(adPreviews["24"].preview).toBe("https://example.org/full.jpg");
  expect(adPreviews["25"]).toMatchObject({
    source: "https://example.org/video.mp4",
    ratio: 1080 / 1920,
  });
  expect(assets.find((a) => a.type === "video")?.source).toBe(
    adPreviews["25"].source,
  );
  expect(warnings).toEqual([]);
  expect(assets).toHaveLength(4);
  const first = assets.filter((a) => a.adId === "21");
  expect(first).toHaveLength(3);
  expect(first.map((a) => a.metrics?.spend ?? null)).toEqual(
    expect.arrayContaining([8, 2, null]),
  );
  expect(first.find((a) => a.key === "21:image:hash-a")).toMatchObject({
    preview: "https://example.org/full.jpg",
    metrics: { impressions: 40, clicks: 3, leads: 1 },
  });
});
