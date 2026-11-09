import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: state.auth,
}));
vi.mock("@/lib/supabase/organization-admin", () => ({
  apiError: (_error: unknown, status = 400) =>
    Response.json({ error: "Falha na operação" }, { status }),
}));
import { PATCH, DELETE } from "@/app/api/forms/[formId]/route";
const id = "00000000-0000-4000-8000-000000000100";
const context = { params: Promise.resolve({ formId: id }) };
const request = () =>
  new Request("http://localhost/api/forms/" + id, {
    method: "PATCH",
    body: JSON.stringify({ action: "restore" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    update: state.update,
    eq: state.eq,
    select: state.select,
    maybeSingle: state.maybeSingle,
  };
  state.from.mockReturnValue(query);
  state.update.mockReturnValue(query);
  state.eq.mockReturnValue(query);
  state.select.mockReturnValue(query);
  state.maybeSingle.mockResolvedValue({ data: { id }, error: null });
  state.auth.mockResolvedValue({
    supabase: { from: state.from },
    organizationId: "org-authorized",
    userId: "user",
  });
});
describe("Arquivamento com sessão e RLS", () => {
  it("restaura somente arquivados na própria organização, sem publicar ou alterar versões", async () => {
    const response = (await PATCH(request(), context))!;
    expect(response!.status).toBe(200);
    expect(state.from).toHaveBeenCalledExactlyOnceWith("atendhub_forms");
    expect(state.update.mock.calls[0][0]).toMatchObject({ status: "draft" });
    expect(Object.keys(state.update.mock.calls[0][0]).sort()).toEqual([
      "status",
      "updated_at",
    ]);
    expect(state.eq).toHaveBeenCalledWith("id", id);
    expect(state.eq).toHaveBeenCalledWith("organization_id", "org-authorized");
    expect(state.eq).toHaveBeenCalledWith("status", "archived");
  });
  it("sem sessão não consulta nem altera o banco", async () => {
    state.auth.mockResolvedValue({
      error: Response.json({ error: "Não autorizado" }, { status: 401 }),
    });
    expect((await PATCH(request(), context))!.status).toBe(401);
    expect(state.from).not.toHaveBeenCalled();
  });
  it("não declara sucesso quando nenhum registro autorizado foi alterado", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request(), context))!.status).toBe(409);
    expect(
      (await DELETE(new Request("http://localhost"), context))!.status,
    ).toBe(409);
  });
  it("rejeita ações inválidas antes da gravação", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ action: "publish" }),
      }),
      context,
    );
    expect(response!.status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
  });
  it("arquiva sem excluir dados e mantendo o filtro de organização", async () => {
    expect(
      (await DELETE(new Request("http://localhost"), context))!.status,
    ).toBe(200);
    expect(state.update.mock.calls[0][0].status).toBe("archived");
    expect(state.eq).toHaveBeenCalledWith("organization_id", "org-authorized");
  });
});
