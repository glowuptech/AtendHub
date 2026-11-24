"use client";

import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { useInboxMessages } from "../hooks";
import { InboxMessageList } from "./message-list";

export type InboxMessageHistory = ReturnType<typeof useInboxMessages>;

export function BookingConversationPreview({
  contactName,
  history,
}: {
  contactName: string;
  history: InboxMessageHistory;
}) {
  const {
    messages,
    hasMore,
    loading,
    error,
    loadOlder,
    loadingOlder,
    olderError,
    refresh,
  } = history;
  const viewport = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastMessage = messages.at(-1)?.id;

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const scrollToLatest = () => {
      if (atBottom.current && node.clientHeight)
        node.scrollTop = node.scrollHeight;
    };
    scrollToLatest();
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(node);
    return () => observer.disconnect();
  }, [lastMessage]);

  return (
    <section
      className="booking-conversation-preview"
      aria-label="Prévia da conversa"
    >
      <header>
        <h3>Conversa com {contactName}</h3>
        <small className="muted">Somente leitura</small>
      </header>
      <div
        ref={viewport}
        className="inbox-message-history booking-conversation-history"
        role="region"
        aria-label="Mensagens da prévia"
        tabIndex={0}
        onScroll={(event) => {
          const node = event.currentTarget;
          atBottom.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
      >
        {hasMore && (
          <div className="inbox-load-older">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingOlder}
              onClick={() => {
                atBottom.current = false;
                void loadOlder();
              }}
            >
              {loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
            </Button>
            {olderError && <p role="alert">{olderError}</p>}
          </div>
        )}
        {loading && !messages.length && (
          <p role="status">Carregando mensagens…</p>
        )}
        {error && !messages.length && (
          <div role="alert">
            <p>Não foi possível carregar as mensagens.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {!loading && !error && !messages.length && (
          <p>Nenhuma mensagem registrada.</p>
        )}
        <InboxMessageList messages={messages} />
      </div>
    </section>
  );
}
