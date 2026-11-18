import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: state.session,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: state.admin }));
import { GET } from "@/app/api/clients/[clientId]/accesses/route";
const id = "00000000-0000-4000-8000-000000000100";
const call = () =>
  GET(new Request("http://localhost"), {
    params: Promise.resolve({ clientId: id }),
  });
beforeEach(() => vi.clearAllMocks());
it("recusa usuário sem sessão antes de acessar o cofre", async () => {
  state.session.mockResolvedValue({
    error: Response.json({}, { status: 401 }),
  });
  expect((await call())!.status).toBe(401);
  expect(state.admin).not.toHaveBeenCalled();
});
it("recusa atendente e gerente mesmo que tenham acesso ao cliente", async () => {
  for (const role of ["attendant", "manager"]) {
    state.session.mockResolvedValue({ role, supabase: { from: state.from } });
    expect((await call())!.status).toBe(403);
  }
  expect(state.from).not.toHaveBeenCalled();
  expect(state.admin).not.toHaveBeenCalled();
});
it("valida cliente com sessão/RLS antes de qualquer consulta privilegiada", async () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  state.from.mockReturnValue(chain);
  state.session.mockResolvedValue({
    role: "super_admin",
    organizationId: "org",
    supabase: { from: state.from },
  });
  expect((await call())!.status).toBe(404);
  expect(chain.eq).toHaveBeenCalledWith("organization_id", "org");
  expect(chain.eq).toHaveBeenCalledWith("id", id);
  expect(state.admin).not.toHaveBeenCalled();
});
