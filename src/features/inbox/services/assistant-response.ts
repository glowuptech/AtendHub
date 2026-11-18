import { z } from "zod";
import type { AssistantSource } from "./assistant";

const responseSourceSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  reference: z.string().trim().max(1000).default(""),
});

const webhookResponseSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  answer: z.string().trim().max(12_000).optional(),
  sources: z.array(responseSourceSchema).max(20).default([]),
  suggestedReply: z.string().trim().max(6_000).optional(),
  message: z.string().trim().max(1000).optional(),
});

export type AssistantWebhookOutcome =
  | {
      kind: "success";
      answer: string;
      sources: AssistantSource[];
      suggestedReply: string | null;
    }
  | { kind: "failed"; message: string }
  | { kind: "invalid"; message: string };

function unwrapWebhookResult(input: unknown): Record<string, unknown> {
  let value = input;
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(value)) {
      if (value.length !== 1) throw new Error("O n8n retornou mais de um item.");
      value = value[0];
      continue;
    }
    if (typeof value === "string") {
      value = JSON.parse(value);
      continue;
    }
    if (typeof value === "object" && value !== null && "Final" in value) {
      value = (value as { Final: unknown }).Final;
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Record<string, unknown>;
    break;
  }
  throw new Error("O Respond to Webhook não retornou um objeto JSON.");
}

export function parseAssistantWebhookResponse(
  bodyText: string,
  expected: { requestId: string; threadId: string; conversationId: string },
): AssistantWebhookOutcome {
  let parsed: z.infer<typeof webhookResponseSchema>;
  try {
    parsed = webhookResponseSchema.parse(
      unwrapWebhookResult(JSON.parse(bodyText)),
    );
  } catch {
    return {
      kind: "invalid",
      message: "O Respond to Webhook não retornou JSON válido no contrato do Assistente.",
    };
  }

  if (
    parsed.requestId !== expected.requestId ||
    (parsed.threadId !== undefined && parsed.threadId !== expected.threadId) ||
    (parsed.conversationId !== undefined &&
      parsed.conversationId !== expected.conversationId)
  )
    return {
      kind: "invalid",
      message: "A resposta do n8n não corresponde a esta pergunta e conversa.",
    };

  if (!parsed.ok)
    return {
      kind: "failed",
      message: parsed.message || "O workflow informou que não conseguiu responder.",
    };

  if (
    parsed.threadId !== expected.threadId ||
    parsed.conversationId !== expected.conversationId ||
    !parsed.answer?.trim()
  )
    return {
      kind: "invalid",
      message: "A resposta do n8n está incompleta ou aponta para outro contexto.",
    };

  return {
    kind: "success",
    answer: parsed.answer,
    sources: parsed.sources,
    suggestedReply: parsed.suggestedReply?.trim() || null,
  };
}
