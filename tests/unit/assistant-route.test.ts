import { afterEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  ask: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: state.auth,
}));
vi.mock("@/features/inbox/assistant-server", () => ({
  AssistantError: class AssistantError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  askAssistant: state.ask,
  getAssistantHistory: state.history,
}));

import { GET, POST } from "@/app/api/inbox/conversations/[id]/assistant/route";

const conversationId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";

function context() {
  return { params: Promise.resolve({ id: conversationId }) };
}

function post(body: unknown) {
  return new Request(`http://localhost/api/inbox/conversations/${conversationId}/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API do Assistente", () => {
  afterEach(() => vi.resetAllMocks());

  test("bloqueia usuário inativo antes de ler histórico ou chamar o workflow", async () => {
    state.auth.mockResolvedValue({
      error: Response.json({ error: "Acesso negado." }, { status: 403 }),
    });

    const response = (await GET(
      new Request(`http://localhost/api/inbox/conversations/${conversationId}/assistant`),
      context(),
    ))!;

    expect(response.status).toBe(403);
    expect(state.history).not.toHaveBeenCalled();
    expect(state.ask).not.toHaveBeenCalled();
  });

  test("só aceita os campos de navegador previstos e não confia em clientId", async () => {
    state.auth.mockResolvedValue({ userId, organizationId: "22222222-2222-4222-8222-222222222222", role: "attendant" });
    const response = (await POST(
      post({
        requestId: "44444444-4444-4444-8444-444444444444",
        question: "Qual é o horário?",
        clientId: "55555555-5555-4555-8555-555555555555",
      }),
      context(),
    ))!;

    expect(response.status).toBe(400);
    expect(state.ask).not.toHaveBeenCalled();
  });

  test("passa apenas conversa, pergunta, requestId e thread validável ao serviço", async () => {
    const auth = { userId, organizationId: "22222222-2222-4222-8222-222222222222", role: "attendant" };
    state.auth.mockResolvedValue(auth);
    state.ask.mockResolvedValue({ threadId: "66666666-6666-4666-8666-666666666666", exchange: { status: "processing" } });
    const body = {
      requestId: "44444444-4444-4444-8444-444444444444",
      threadId: "66666666-6666-4666-8666-666666666666",
      question: "  Qual é o horário?  ",
    };

    const response = (await POST(post(body), context()))!;

    expect(response.status).toBe(200);
    expect(state.ask).toHaveBeenCalledWith(auth, {
      conversationId,
      requestId: body.requestId,
      question: "Qual é o horário?",
      threadId: body.threadId,
    });
  });
});
