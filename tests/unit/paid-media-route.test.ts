import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: vi.fn(),
  tenant: vi.fn(),
  report: vi.fn(),
  analytics: vi.fn(),
  scope: vi.fn(),
  rpc: vi.fn(),
  discover: vi.fn(),
  syncStatus: vi.fn(),
  requireAdmin: vi.fn(),
  credentialStatus: vi.fn(),
  saveMetaAccess: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: state.session,
}));
vi.mock("@/features/client-domains/server", () => ({
  tenantAtHost: state.tenant,
}));
vi.mock("@/features/paid-media/meta", () => ({
  discoverMetaAccounts: state.discover,
  MetaError: Error,
}));
vi.mock("@/features/paid-media/meta-credentials", () => ({
  readMetaCredentialStatus: state.credentialStatus,
  saveMetaAccess: state.saveMetaAccess,
}));
vi.mock("@/features/paid-media/analytics-server", () => ({
  readMetaAnalytics: state.analytics,
}));
vi.mock("@/features/paid-media/server", () => ({
  readReport: state.report,
  readPlans: vi.fn(),
  reportFailure: vi.fn(),
  clientScope: state.scope,
  paidMediaAdmin: () => ({ rpc: state.rpc }),
  requireAdmin: state.requireAdmin,
}));
vi.mock("@/features/paid-media/sync", () => ({
  readAutoSyncStatus: state.syncStatus,
}));
import { GET, POST } from "@/app/api/paid-media/route";

const clientId = "00000000-0000-4000-8000-000000000901";
const otherId = "00000000-0000-4000-8000-000000000902";
const context = { organizationId: "org", userId: "user", role: "super_admin" };
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(context);
  state.tenant.mockResolvedValue(clientId);
  state.report.mockResolvedValue({ canManage: true });
  state.scope.mockResolvedValue([{ id: clientId }]);
  state.rpc.mockResolvedValue({ error: null });
});
it("consulta o estado do cron pela organização administrativa e protege o portal", async () => {
  const path = "/api/paid-media?kind=syncStatus";
  state.syncStatus.mockResolvedValue({ configured: true, accounts: [] });

  const portal = await GET(
    new Request("https://clinica.atendehub.app" + path, {
      headers: { host: "clinica.atendehub.app" },
    }),
  );
  expect(portal?.status).toBe(403);
  expect(state.syncStatus).not.toHaveBeenCalled();

  const panel = await GET(
    new Request("https://painel.atendehub.app" + path, {
      headers: { host: "painel.atendehub.app" },
    }),
  );
  expect(await panel!.json()).toEqual({ configured: true, accounts: [] });
  expect(state.requireAdmin).toHaveBeenCalledWith(context);
  expect(state.syncStatus).toHaveBeenCalledWith(context.organizationId);
});
it("força o relatório da clínica e desabilita a administração no host do portal", async () => {
  const url =
    "https://clinica.atendehub.app/api/paid-media?from=2026-11-20&to=2026-11-21";
  const report = await GET(
    new Request(url, { headers: { host: "clinica.atendehub.app" } }),
  );
  expect(state.report).toHaveBeenCalledWith(
    context,
    { from: "2026-11-20", to: "2026-11-21" },
    clientId,
  );
  expect(await report!.json()).toEqual({
    canManage: false,
  });
  const switched = await GET(
    new Request(url + "&clientId=" + otherId, {
      headers: { host: "clinica.atendehub.app" },
    }),
  );
  expect(switched?.status).toBe(403);
  const accounts = await GET(
    new Request(url + "&kind=metaAccounts", {
      headers: { host: "clinica.atendehub.app" },
    }),
  );
  expect(accounts?.status).toBe(403);
  expect(state.discover).not.toHaveBeenCalled();
});
it("usa a organização da sessão para salvar o token e bloqueia o portal", async () => {
  const status = {
    configured: true,
    updatedAt: "2026-11-23T13:00Z",
    setupMessage: null,
  };
  const token = "meta-test-secret-token";
  state.saveMetaAccess.mockResolvedValue(status);
  const request = (host: string) =>
    new Request(`https://${host}/api/paid-media`, {
      method: "POST",
      headers: { host },
      body: JSON.stringify({
        action: "saveMetaCredential",
        organizationId: otherId,
        token,
      }),
    });

  expect((await POST(request("clinica.atendehub.app")))?.status).toBe(403);
  expect(state.saveMetaAccess).not.toHaveBeenCalled();
  const response = await POST(request("painel.atendehub.app"));
  expect(await response!.json()).toEqual(status);
  expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(state.requireAdmin).toHaveBeenCalledWith(context);
  expect(state.saveMetaAccess).toHaveBeenCalledWith(
    expect.anything(),
    context.organizationId,
    token,
  );
});
it("registra regra de frase com a linha e campanha escolhidas pelo formulário", async () => {
  const response = await POST(
    new Request("https://painel.atendehub.app/api/paid-media", {
      method: "POST",
      headers: { host: "painel.atendehub.app" },
      body: JSON.stringify({
        action: "phrase",
        clientId,
        connectionId: otherId,
        campaignId: "100",
        phrase: "Quero saber mais",
      }),
    }),
  );
  expect(response?.status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("atendhub_save_paid_whatsapp_rule", {
    p_org: "org",
    p_client: clientId,
    p_connection: otherId,
    p_campaign: "100",
    p_phrase: "Quero saber mais",
  });
});
it("limita os indicadores novos ao cliente do portal de origem", async () => {
  const host = "clinica.atendehub.app";
  const url = `https://${host}/api/paid-media?kind=analytics&from=2026-11-20&to=2026-11-21`;
  state.analytics.mockResolvedValue({ accounts: [] });
  const response = await GET(new Request(url, { headers: { host } }));
  expect(await response!.json()).toEqual({ accounts: [] });
  expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(state.analytics).toHaveBeenCalledWith(
    context,
    { from: "2026-11-20", to: "2026-11-21" },
    clientId,
    true,
  );
  expect(
    (
      await GET(
        new Request(url + "&clientId=" + otherId, { headers: { host } }),
      )
    )?.status,
  ).toBe(403);
  expect(state.analytics).toHaveBeenCalledTimes(1);
});
