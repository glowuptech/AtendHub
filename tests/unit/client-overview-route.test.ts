import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn() }));
vi.mock("@/features/clients/accesses/server", () => ({
  authorizeClient: mocks.authorize,
  noStore: { "Cache-Control": "no-store" },
}));
vi.mock("@/features/clients/services/overview-server", () => ({
  readClientOverview: mocks.read,
}));
import { GET } from "@/app/api/clients/[clientId]/overview/route";

const clientId = "00000000-0000-4000-8000-000000000901";
const professional = "00000000-0000-4000-8000-000000000902";
const context = { params: Promise.resolve({ clientId }) };
const range = { from: "2026-11-21", to: "2026-11-24" };
const request = (host = "painel.atendehub.app", from = range.from) =>
  new Request(
    `https://${host}/api/clients/${clientId}/overview?from=${from}&to=${range.to}&professional=${professional}`,
    { headers: { host } },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ supabase: {}, organizationId: "org" });
  mocks.read.mockResolvedValue({ leadCount: 3 });
});

it("aplica o cliente autorizado e os filtros na leitura dos dados operacionais", async () => {
  const response = await GET(request(), context);
  expect(mocks.authorize).toHaveBeenCalledWith(clientId);
  expect(mocks.read).toHaveBeenCalledWith({}, "org", clientId, {
    ...range,
    professional,
  });
  expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(await response?.json()).toEqual({ leadCount: 3 });
});

it("recusa o portal, acessos negados e datas inválidas antes de consultar indicadores", async () => {
  const portal = await GET(request("cliente.atendehub.app"), context);
  expect(portal?.status).toBe(403);
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect(
    (await GET(request("painel.atendehub.app", "2026-11-30"), context))?.status,
  ).toBe(400);
  mocks.authorize.mockResolvedValue({
    error: new Response(null, { status: 404 }),
  });
  expect((await GET(request(), context))?.status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});
