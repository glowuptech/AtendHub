export type AssistantStatus =
  | "processing"
  | "succeeded"
  | "failed"
  | "uncertain";

export type AssistantSource = {
  id: string;
  title: string;
  reference: string;
};

export type AssistantExchange = {
  id: string;
  requestId: string;
  eventId: string;
  question: string;
  status: AssistantStatus;
  attemptCount: number;
  error: string | null;
  answer: string | null;
  sources: AssistantSource[];
  suggestedReply: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantHistory = {
  conversationId: string;
  threadId: string | null;
  exchanges: AssistantExchange[];
  hasMore: boolean;
  nextCursor: string | null;
  webhookConfigured: boolean;
  knowledge: {
    approvedCount: number;
    empty: boolean;
    version: string | null;
  };
};

export type AssistantAskResult = {
  threadId: string;
  exchange: AssistantExchange;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível consultar o assistente.");
  return body as T;
}

export const assistantService = {
  async history(conversationId: string, before?: string) {
    const query = before ? `?before=${encodeURIComponent(before)}` : "";
    const response = await fetch(
      `/api/inbox/conversations/${conversationId}/assistant${query}`,
      { cache: "no-store" },
    );
    return readJson<AssistantHistory>(response);
  },

  async ask(input: {
    conversationId: string;
    question: string;
    requestId: string;
    threadId: string | null;
  }) {
    const response = await fetch(
      `/api/inbox/conversations/${input.conversationId}/assistant`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: input.question,
          requestId: input.requestId,
          ...(input.threadId ? { threadId: input.threadId } : {}),
        }),
      },
    );
    return readJson<AssistantAskResult>(response);
  },
};
