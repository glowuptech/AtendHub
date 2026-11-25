import { beforeEach, expect, it, vi } from "vitest";
import { makePersistedPathForm } from "../editor-harness/path-fixture";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  tenant: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/whatsapp/server", () => ({ integrationAdmin: () => mocks }));
vi.mock("@/features/client-domains/server", () => ({
  tenantAtHost: mocks.tenant,
}));
import { GET, POST } from "@/app/api/public/forms/[slug]/route";

const form = makePersistedPathForm("snapshot");
const version = form.versions[0];
const ctx = { params: Promise.resolve({ slug: form.slug }) };
const query = (row: object) => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: row });
  chain.limit.mockResolvedValue({ data: [row] });
  return chain;
};
const forms = query({
  id: form.id,
  organization_id: form.organizationId,
  client_id: form.clientId,
  slug: form.slug,
  name: form.name,
  description: "",
  doctor_id: null,
  status: "demo",
  active_version_id: version.id,
});
const versions = query({
  id: version.id,
  form_id: form.id,
  organization_id: form.organizationId,
  client_id: form.clientId,
  number: 1,
  state: "snapshot",
  definition: { version, fields: form.fields },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.mockResolvedValue(form.clientId);
  mocks.from.mockImplementation((table) =>
    table === "atendhub_forms"
      ? forms
      : table === "atendhub_form_versions"
        ? versions
        : query({ name: "Clínica" }),
  );
});
const request = (body?: object) =>
  new Request("https://clinica.atendehub.app/api/public/forms/" + form.slug, {
    method: body ? "POST" : "GET",
    headers: { host: "clinica.atendehub.app" },
    body: body && JSON.stringify(body),
  });

it("abre apenas o snapshot ativo do cliente do domínio sem sessão do painel", async () => {
  const response = await GET(request(), ctx);
  expect(response.status).toBe(200);
  expect((await response.json()).versions[0].successMessage).toBe("Recebemos seu cadastro.");
  expect(forms.eq).toHaveBeenCalledWith("status", "demo");
  expect(forms.eq).toHaveBeenCalledWith("client_id", form.clientId);
  expect(versions.eq).toHaveBeenCalledWith("id", version.id);
  expect(versions.eq).toHaveBeenCalledWith("state", "snapshot");
  mocks.tenant.mockResolvedValue(null);
  expect((await GET(request(), ctx)).status).toBe(404);
});
it("remove respostas fora do caminho antes de gravar o cadastro público", async () => {
  const [router, a, b, common] = version.steps;
  const body = {
    sessionId: "visit",
    versionId: version.id,
    idempotencyKey: crypto.randomUUID(),
    contacts: { name: "Paciente Teste", phone: "11999990000", email: "" },
    complete: true,
    answers: {
      [router.question.id]: "morning",
      [a.question.id]: "Resposta A",
      [b.question.id]: "Resposta B",
      [common.question.id]: true,
    },
  };
  mocks.rpc.mockResolvedValue({ data: crypto.randomUUID() });
  expect((await POST(request(body), ctx)).status).toBe(201);
  const [, payload] = mocks.rpc.mock.calls[0];
  expect(
    payload.p_responses.map((r: { question_id: string }) => r.question_id),
  ).toEqual([router.question.id, a.question.id, common.question.id]);
  expect(
    (await POST(request({ ...body, versionId: crypto.randomUUID() }), ctx))
      .status,
  ).toBe(409);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it.each([
  ["(16) 3456-7890", "+551634567890"],
  ["(55) 98765-4321", "+5555987654321"],
  ["+55 (11) 98765-4321", "+5511987654321"],
])(
  "normaliza o WhatsApp e a pergunta de telefone %s antes de gravar",
  async (phone, expected) => {
    const [router, , question] = version.steps;
    const body = {
      sessionId: "visit",
      idempotencyKey: crypto.randomUUID(),
      complete: false,
      contacts: { name: "Teste", phone, email: "" },
      answers: {
        [router.question.id]: "afternoon",
        [question.question.id]: phone,
      },
    };
    mocks.rpc.mockResolvedValue({ data: crypto.randomUUID() });
    expect((await POST(request(body), ctx)).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_contacts: { phone: expected },
      p_responses: expect.arrayContaining([
        expect.objectContaining({
          question_id: question.question.id,
          value: expected,
        }),
      ]),
    });
  },
);

it.each([
  "98765-4321",
  "(00) 98765-4321",
  "(11) 987654-3210",
  "+1 212 555 0123",
  "11abc987654321",
])("rejeita o WhatsApp inválido %s também no envio parcial", async (phone) => {
  const body = {
    sessionId: "visit",
    idempotencyKey: crypto.randomUUID(),
    complete: false,
    contacts: { name: "Teste", phone, email: "" },
    answers: {},
  };
  expect((await POST(request(body), ctx)).status).toBe(422);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
