"use client";
import { useLayoutEffect, useRef, useState } from "react";
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
import type { Client, Conversation, Lead } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { stageLabels } from "@/components/layout/shared";
import { ContactAvatar } from "./avatar";
import { contactName, messageDay, messageTime } from "../services/presentation";
export function ChatPanel({
  client,
  lead,
  conversation,
  draft,
  onDraft,
  onBack,
  onContext,
  contextOpen,
}: {
  client: Client;
  lead: Lead;
  conversation: Conversation;
  draft: string;
  onDraft: (text: string) => void;
  onBack: () => void;
  onContext: () => void;
  contextOpen: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    history = useRef<HTMLDivElement>(null);
  const [emoji, setEmoji] = useState(false),
    [notice, setNotice] = useState(""),
    [below, setBelow] = useState(false);
  const messages = [...conversation.messages].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  const lastId = messages.at(-1)?.id;
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const node = history.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [lastId]);
  useLayoutEffect(() => {
    const node = input.current;
    if (node) {
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
    }
  }, [draft]);
  const doctor = client.doctors.find((d) => d.id === lead.doctorId);
  return (
    <section
      className="inbox-chat thread"
      aria-label={`Conversa com ${contactName(lead, conversation)}`}
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
        <ContactAvatar
          name={contactName(lead, conversation)}
          photoUrl={conversation.photoUrl}
        />
        <div className="inbox-chat-person">
          <strong>{contactName(lead, conversation)}</strong>
          <small>
            {doctor ? `${doctor.name} · ${client.name}` : client.name}
          </small>
          <span>{stageLabels[lead.stage]}</span>
        </div>
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
      <div className="inbox-connection">
        <WifiOff size={14} />
        <span>WhatsApp desconectado · envio indisponível</span>
      </div>
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
        {!messages.length && (
          <div className="inbox-chat-empty">
            <h3>Nenhuma mensagem registrada</h3>
            <p>O histórico deste contato aparecerá aqui.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            {(!i || messageDay(messages[i - 1].at) !== messageDay(m.at)) && (
              <div className="inbox-day-separator">
                <span>{messageDay(m.at)}</span>
              </div>
            )}
            <article
              className={`inbox-message ${m.direction}`}
              aria-label={`${m.direction === "inbound" ? "Recebida" : "Enviada"} às ${messageTime(m.at)}`}
            >
              <p>{m.body}</p>
              <footer>
                <time dateTime={m.at}>{messageTime(m.at)}</time>
                <span>Registro local</span>
              </footer>
            </article>
          </div>
        ))}
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
      <form className="inbox-composer" onSubmit={(e) => e.preventDefault()}>
        <div className="inbox-composer-field">
          <label className="sr-only" htmlFor={`message-${conversation.id}`}>
            Mensagem para {contactName(lead, conversation)}
          </label>
          <textarea
            ref={input}
            id={`message-${conversation.id}`}
            rows={1}
            value={draft}
            maxLength={6000}
            onChange={(e) => onDraft(e.target.value)}
            placeholder="Escreva um rascunho…"
          />
        </div>
        <div className="inbox-composer-tools">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Escolher emoji"
            aria-expanded={emoji}
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
            title="Depende da integração WhatsApp"
          >
            <Paperclip size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Áudio indisponível"
            disabled
            title="Depende da integração WhatsApp"
          >
            <Mic size={18} />
          </Button>
          <small>Rascunho nesta sessão</small>
          <Button
            type="button"
            size="icon"
            aria-label="Enviar mensagem"
            disabled
            title="Conecte o WhatsApp para enviar"
          >
            <Send size={18} />
          </Button>
        </div>
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
            Prévia local
          </summary>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setNotice(
                "Exemplo de resposta administrativa exibido. Nenhuma mensagem foi enviada.",
              )
            }
          >
            Demonstrar resposta
          </Button>
          {notice && <p role="status">{notice}</p>}
        </details>
      </form>
    </section>
  );
}
