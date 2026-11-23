import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: vi.fn(),
  tenant: vi.fn(),
  report: vi.fn(),
  scope: vi.fn(),
  rpc: vi.fn(),
  discover: vi.fn(),
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
vi.mock("@/features/paid-media/server", () => ({
  readReport: state.report,
  readPlans: vi.fn(),
  reportFailure: vi.fn(),
  clientScope: state.scope,
  paidMediaAdmin: () => ({ rpc: state.rpc }),
  requireAdmin: vi.fn(),
}));
import { GET, POST } from "@/app/api/paid-media/route";

const clientId = "00000000-0000-4000-8000-000000000901";
const otherId = "00000000-0000-4000-8000-000000000902";
const context = { organizationId: "org", userId: "user", role: "super_admin" };
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(context);
  state.tenant.mockResolvedValue(clientId);
  state.report.mockResolvedValue({ canManage: true, metaConfigured: true });
  state.scope.mockResolvedValue([{ id: clientId }]);
  state.rpc.mockResolvedValue({ error: null });
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
    metaConfigured: false,
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
