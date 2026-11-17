import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: state.auth,
}));
vi.mock("@/lib/supabase/organization-admin", () => ({
  apiError: () => Response.json({ error: "Falha" }, { status: 500 }),
}));
import { POST } from "@/app/api/leads/[leadId]/claim/route";
const id = "00000000-0000-4000-8000-000000000123";
const call = (leadId = id) =>
  POST(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ leadId }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.mockResolvedValue({
    organizationId: "org",
    userId: "user",
    supabase: { rpc: state.rpc },
  });
  state.rpc.mockResolvedValue({ data: { id, owner_id: "user" }, error: null });
});
it("assume usando apenas sessão e RPC, sem calendário nem dono enviado pelo navegador", async () => {
  expect((await call())!.status).toBe(200);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("atendhub_claim_lead", {
    _organization_id: "org",
    _lead_id: id,
  });
});
it("sem sessão não chama RPC", async () => {
  state.auth.mockResolvedValue({ error: Response.json({}, { status: 401 }) });
  expect((await call())!.status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("valida o ID antes de chamar RPC", async () => {
  expect((await call("invalid"))!.status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("mantém a proibição do banco com uma mensagem legível", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "forbidden" },
  });
  const result = (await call())!;
  expect(result.status).toBe(403);
  expect((await result.json()).error).toContain("permissão");
});
it("conflito de responsável retorna 409 sem simular sucesso", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "LEAD_ALREADY_CLAIMED" },
  });
  expect((await call())!.status).toBe(409);
});
