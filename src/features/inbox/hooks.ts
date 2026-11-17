"use client";
import { useCallback, useState } from "react";
import useSWR from "swr";
import type { InboxConversation, InboxMessage, MessageStatus } from "./model";

type MessagePage = { messages: InboxMessage[]; hasMore: boolean };

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível carregar o Inbox.");
  return body as T;
}

// Polling is the fallback transport; Realtime can replace it without changing callers.
export function useInboxConversations() {
  return useSWR<InboxConversation[]>("/api/inbox/conversations", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
}

export function useInboxMessages(conversationId: string | null) {
  const latest = useSWR<MessagePage>(
    conversationId ? `/api/inbox/conversations/${conversationId}/messages` : null,
    fetcher,
    { refreshInterval: 3000, revalidateOnFocus: true },
  );
  const [older, setOlder] = useState<InboxMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");

  const oldest = older[0] ?? latest.data?.messages[0];
  const loadOlder = useCallback(async () => {
    if (!conversationId || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const page = await fetcher<MessagePage>(
        `/api/inbox/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.occurredAt)}`,
      );
      setOlder((previous) => [...page.messages, ...previous]);
      setOlderHasMore(page.hasMore);
    } catch (error) {
      setOlderError(
        error instanceof Error ? error.message : "Falha ao carregar mensagens.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, oldest, loadingOlder]);

  const byId = new Map<string, InboxMessage>();
  for (const message of [...older, ...(latest.data?.messages ?? [])])
    byId.set(message.id, message);
  const messages = [...byId.values()].sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
  return {
    messages,
    hasMore: older.length ? (olderHasMore ?? false) : (latest.data?.hasMore ?? false),
    loading: latest.isLoading,
    error: latest.error as Error | undefined,
    loadOlder,
    loadingOlder,
    olderError,
    refresh: () => latest.mutate(),
  };
}

export type SendResponse = {
  messageId: string;
  status: MessageStatus;
  failureReason: string | null;
};

export async function sendMessage(
  conversationId: string,
  requestId: string,
  body: string,
): Promise<SendResponse> {
  const response = await fetch(
    `/api/inbox/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, body }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error ?? "Não foi possível enviar a mensagem.");
  return result as SendResponse;
}

export async function markRead(conversationId: string) {
  await fetch(`/api/inbox/conversations/${conversationId}/read`, {
    method: "POST",
  }).catch(() => undefined);
}
