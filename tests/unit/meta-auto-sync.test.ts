import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  configured: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/paid-media/meta", () => ({
  fetchMetaSnapshot: state.fetchSnapshot,
  metaConfigured: state.configured,
  MetaError: class extends Error {},
}));
vi.mock("@/features/paid-media/server", () => ({
  paidMediaAdmin: () => ({ rpc: state.rpc }),
  MediaError: class extends Error {},
  reportFailure: () => ({ status: 500, error: "Falha na sincronização." }),
}));

import { GET } from "@/app/api/cron/meta-sync/route";
import { MetaError } from "@/features/paid-media/meta";

const org = "00000000-0000-4000-8000-000000000001";
const started = "2026-11-23T01:30:00Z";
const url = "https://painel.atendehub.app/api/cron/meta-sync";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-test");
  vi.stubEnv("ATENDHUB_META_ORGANIZATION_ID", org);
  state.configured.mockReturnValue(true);
});
afterEach(() => vi.unstubAllEnvs());

it("exige segredo do agendador e organização Meta configurada", async () => {
  expect((await GET(new Request(url))).status).toBe(401);
  const request = new Request(url, {
    headers: { Authorization: "Bearer cron-test" },
  });
  state.configured.mockReturnValue(false);
  expect((await GET(request)).status).toBe(503);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("importa por fuso, registra falhas por conta e continua o lote", async () => {
  const jobs = [
    {
      account_id: "act_101",
      timezone: "America/Sao_Paulo",
      started_at: started,
    },
    { account_id: "act_102", timezone: "UTC", started_at: started },
  ];
  let claims = 0;
  state.rpc.mockImplementation((name: string) => ({
    abortSignal: async () => ({
      data:
        name === "atendhub_meta_auto_sync_claim"
          ? claims++ === 0
            ? jobs
            : []
          : true,
      error: null,
    }),
  }));
  const snapshot = { campaigns: [], ads: [], insights: [] };
  state.fetchSnapshot.mockImplementation((_, account) => {
    if (account === "act_101")
      throw new MetaError("A Meta limitou as consultas.");
    return Promise.resolve(snapshot);
  });

  const response = await GET(
    new Request(url, { headers: { Authorization: "Bearer cron-test" } }),
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    ok: false,
    imported: 1,
    failed: 1,
    superseded: 0,
    timeLimitReached: false,
  });
  expect(state.fetchSnapshot).toHaveBeenCalledWith(
    org,
    "act_101",
    "2026-11-15",
    "2026-11-22",
  );
  expect(state.fetchSnapshot).toHaveBeenCalledWith(
    org,
    "act_102",
    "2026-11-16",
    "2026-11-23",
  );
  expect(state.rpc).toHaveBeenCalledWith("atendhub_meta_import", {
    p_org: org,
    p_account: "act_102",
    p_from: "2026-11-16",
    p_to: "2026-11-23",
    p_started: started,
    p_campaigns: [],
    p_ads: [],
    p_insights: [],
  });
  expect(state.rpc).toHaveBeenCalledWith("atendhub_meta_auto_sync_finish", {
    p_org: org,
    p_account: "act_101",
    p_started: started,
    p_error: "A Meta limitou as consultas.",
  });
  expect(state.rpc).toHaveBeenCalledWith("atendhub_meta_auto_sync_finish", {
    p_org: org,
    p_account: "act_102",
    p_started: started,
    p_error: null,
  });
});
