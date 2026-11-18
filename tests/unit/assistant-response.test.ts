import { describe, expect, test } from "vitest";
import { parseAssistantWebhookResponse } from "@/features/inbox/services/assistant-response";

const expected = {
  requestId: "11111111-1111-4111-8111-111111111111",
  threadId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
};

const success = {
  ok: true,
  ...expected,
  answer: "A clínica atende de segunda a sexta.",
  sources: [{ id: "standard-0", title: "Horários", reference: "Manual v2" }],
  suggestedReply: "Atendemos de segunda a sexta.",
};

describe("contrato síncrono do assistente", () => {
  test("aceita JSON direto e valida as três correlações", () => {
    expect(parseAssistantWebhookResponse(JSON.stringify(success), expected)).toEqual({
      kind: "success",
      answer: success.answer,
      sources: success.sources,
      suggestedReply: success.suggestedReply,
    });
  });

  test("aceita a lista de um item e Final serializado", () => {
    const wrapped = JSON.stringify([{ Final: JSON.stringify(success) }]);
    expect(parseAssistantWebhookResponse(wrapped, expected).kind).toBe("success");
  });

  test("rejeita lista com múltiplos resultados", () => {
    const wrapped = JSON.stringify([success, success]);
    expect(parseAssistantWebhookResponse(wrapped, expected).kind).toBe("invalid");
  });

  test("rejeita resposta ligada a outra conversa, thread ou solicitação", () => {
    const wrongConversation = JSON.stringify({
      ...success,
      conversationId: "44444444-4444-4444-8444-444444444444",
    });
    expect(parseAssistantWebhookResponse(wrongConversation, expected).kind).toBe("invalid");

    const wrongRequest = JSON.stringify({ ...success, requestId: expected.threadId });
    expect(parseAssistantWebhookResponse(wrongRequest, expected).kind).toBe("invalid");

    const wrongThread = JSON.stringify({ ...success, threadId: expected.conversationId });
    expect(parseAssistantWebhookResponse(wrongThread, expected).kind).toBe("invalid");
  });

  test("falha explícita e resposta vazia não viram sucesso", () => {
    expect(
      parseAssistantWebhookResponse(
        JSON.stringify({ ok: false, requestId: expected.requestId, message: "Base indisponível." }),
        expected,
      ),
    ).toEqual({ kind: "failed", message: "Base indisponível." });

    expect(
      parseAssistantWebhookResponse(
        JSON.stringify({ ok: true, ...expected, answer: "   ", sources: [] }),
        expected,
      ).kind,
    ).toBe("invalid");
    expect(parseAssistantWebhookResponse("", expected).kind).toBe("invalid");
  });
});
