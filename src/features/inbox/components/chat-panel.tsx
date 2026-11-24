"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";
import {
  ArrowLeft,
  PanelRightOpen,
  Smile,
  Paperclip,
  Mic,
  Send,
  WifiOff,
  Eye,
  ChevronDown,
} from "lucide-react";
import { EpisodeActions } from "./episode-actions";
import { ChatShortcuts, type Shortcut } from "./chat-shortcuts";
import { InboxMessageList } from "./message-list";
import { Button } from "@/components/ui/button";
import { stageLabels } from "@/components/layout/shared";
import { ContactAvatar } from "./avatar";
import { markRead, sendMessage, useInboxMessages } from "../hooks";
import type { InboxConversation, InboxMessage } from "../model";

const CONVERSATIONS_KEY = "/api/inbox/conversations";

export function ChatPanel({
  onEpisode,
  conversation,
  draft,
  onDraft,
  onBack,
  onContext,
  contextOpen,
  action,
  onAction,
}: {
  onEpisode?: (id: string) => Promise<void>;
  conversation: InboxConversation;
  draft: string;
  onDraft: (text: string) => void;
  onBack: () => void;
  onContext: () => void;
  contextOpen: boolean;
  action: Shortcut | null;
  onAction: (value: Shortcut | null) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    history = useRef<HTMLDivElement>(null),
    attempt = useRef<{ id: string; body: string } | null>(null),
    readMark = useRef("");
  const [emoji, setEmoji] = useState(false),
    [below, setBelow] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [retrying, setRetrying] = useState("");
  const messageHistory = useInboxMessages(conversation.id);
  const {
    messages,
    hasMore,
    loading,
    error: loadError,
    loadOlder,
    loadingOlder,
    olderError,
    refresh,
  } = messageHistory;
  const lastId = messages.at(-1)?.id;
  const lastStatus = messages.at(-1)?.status;
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const node = history.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [lastId, lastStatus]);
  useLayoutEffect(() => {
    const node = input.current;
    if (node) {
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
    }
  }, [draft]);
  useEffect(() => {
    const key = `${conversation.id}:${conversation.unreadCount}`;
    if (!conversation.unreadCount || readMark.current === key) return;
    readMark.current = key;
    markRead(conversation.id).then(() => globalMutate(CONVERSATIONS_KEY));
  }, [conversation.id, conversation.unreadCount]);

  async function dispatch(requestId: string, body: string) {
    const result = await sendMessage(conversation.id, requestId, body);
    await Promise.all([refresh(), globalMutate(CONVERSATIONS_KEY)]);
    return result;
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending || !conversation.canSend) return;
    // A network failure keeps the same request id so a retry cannot create a duplicate message.
    if (attempt.current?.body !== body)
      attempt.current = { id: crypto.randomUUID(), body };
    setSending(true);
    setError("");
    try {
      await dispatch(attempt.current.id, body);
      attempt.current = null;
      onDraft("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível enviar.",
      );
    } finally {
      setSending(false);
    }
  }

  async function retry(message: InboxMessage) {
    if (!message.requestId || retrying) return;
    setRetrying(message.id);
    setError("");
    try {
      await dispatch(message.requestId, message.body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível reenviar.",
      );
    } finally {
      setRetrying("");
    }
  }

  const subtitle = [conversation.professionalName, conversation.clientName]
    .filter(Boolean)
    .join(" · ");
  const blocked = !conversation.canSend;
  return (
    <section
      className="inbox-chat thread"
      aria-label={`Conversa com ${conversation.contactName}`}
    >
      <header className="inbox-chat-header">
        <Button
          className="inbox-back"
          variant="ghost"
          size="icon"
          aria-label="Voltar às conversas"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </Button>
        <ContactAvatar name={conversation.contactName} />
        <div className="inbox-chat-person">
          <strong>{conversation.contactName}</strong>
          <small>{subtitle}</small>
          <span>
            {stageLabels[conversation.stage as keyof typeof stageLabels] ??
              conversation.stage}
          </span>
        </div>
        {onEpisode && (
          <EpisodeActions conversation={conversation} onDone={onEpisode} />
        )}
        <ChatShortcuts
          key={conversation.id}
          conversation={conversation}
          history={messageHistory}
          open={action}
          onOpen={onAction}
          onClose={() => onAction(null)}
        />
        <Button
          className="inbox-context-toggle"
          size="sm"
          variant="outline"
          aria-label="Informações e IA"
          aria-expanded={contextOpen}
          onClick={onContext}
        >
          <PanelRightOpen size={17} />
          <span>Informações e IA</span>
        </Button>
      </header>
      {conversation.sendBlockedReason && (
        <div className="inbox-connection" role="status">
          <WifiOff size={14} />
          <span>{conversation.sendBlockedReason}</span>
        </div>
      )}
      <div
        ref={history}
        className="inbox-message-history"
        tabIndex={0}
        aria-label="Histórico da conversa"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          setBelow(!atBottom.current);
        }}
      >
        {hasMore && (
          <div className="inbox-load-older">
            <Button
              size="sm"
              variant="outline"
              disabled={loadingOlder}
              onClick={() => {
                atBottom.current = false;
                loadOlder();
              }}
            >
              {loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
            </Button>
            {olderError && <small role="alert">{olderError}</small>}
          </div>
        )}
        {loading && !messages.length && (
          <div className="inbox-chat-empty" role="status">
            <p>Carregando mensagens…</p>
          </div>
        )}
        {loadError && !messages.length && (
          <div className="inbox-chat-empty" role="alert">
            <h3>Não foi possível carregar as mensagens</h3>
            <p>{loadError.message}</p>
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!loading && !loadError && !messages.length && (
          <div className="inbox-chat-empty">
            <h3>Nenhuma mensagem registrada</h3>
            <p>O histórico deste contato aparecerá aqui.</p>
          </div>
        )}
        <InboxMessageList
          messages={messages}
          retrying={retrying}
          onRetry={retry}
        />
      </div>
      {below && (
        <Button
          className="inbox-latest"
          size="sm"
          variant="outline"
          onClick={() => {
            if (history.current)
              history.current.scrollTop = history.current.scrollHeight;
          }}
        >
          <ChevronDown size={15} />
          Últimas mensagens
        </Button>
      )}
      <form
        className="inbox-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="inbox-composer-field">
          <label className="sr-only" htmlFor={`message-${conversation.id}`}>
            Mensagem para {conversation.contactName}
          </label>
          <textarea
            ref={input}
            id={`message-${conversation.id}`}
            rows={1}
            value={draft}
            maxLength={6000}
            disabled={blocked}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              blocked
                ? (conversation.sendBlockedReason ?? "Envio indisponível")
                : "Escreva uma mensagem…"
            }
          />
        </div>
        <div className="inbox-composer-tools">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Escolher emoji"
            aria-expanded={emoji}
            disabled={blocked}
            onClick={() => setEmoji(!emoji)}
          >
            <Smile size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Anexos indisponíveis"
            disabled
            title="Envio de mídia ainda não está disponível"
          >
            <Paperclip size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Áudio indisponível"
            disabled
            title="Envio de áudio ainda não está disponível"
          >
            <Mic size={18} />
          </Button>
          <small>{blocked ? "Somente leitura" : "Texto · Enter envia"}</small>
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar mensagem"
            disabled={blocked || sending || !draft.trim()}
          >
            <Send size={18} />
          </Button>
        </div>
        {error && (
          <p className="inbox-send-error" role="alert">
            {error}
          </p>
        )}
        {emoji && (
          <div className="inbox-emojis" aria-label="Emojis">
            {[
              ["😊", "Sorriso"],
              ["👍", "Positivo"],
              ["👋", "Olá"],
              ["💜", "Coração"],
              ["📅", "Calendário"],
            ].map(([symbol, label]) => (
              <button
                type="button"
                key={symbol}
                aria-label={label}
                onClick={() => {
                  const node = input.current;
                  const start = node?.selectionStart ?? draft.length,
                    end = node?.selectionEnd ?? draft.length;
                  onDraft(draft.slice(0, start) + symbol + draft.slice(end));
                  setEmoji(false);
                  node?.focus();
                }}
              >
                {symbol}
              </button>
            ))}
          </div>
        )}
        <details className="inbox-local-preview">
          <summary>
            <Eye size={13} />
            Sobre o envio
          </summary>
          <p>
            A mensagem só aparece como enviada depois que o n8n confirma o ID do
            WhatsApp. Se a confirmação não chegar, ela fica como “não
            confirmada” para você conferir no WhatsApp.
          </p>
        </details>
      </form>
    </section>
  );
}
