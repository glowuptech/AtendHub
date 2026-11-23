import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  discoverMetaAccounts,
  fetchMetaSnapshot,
} from "@/features/paid-media/meta";

afterEach(() => {
  vi.unstubAllGlobals();
});
const access = { token: "meta-test-token", version: "v99.0" };
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
