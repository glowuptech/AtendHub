import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InboxMessage } from "../model";
import {
  messageDay,
  messageTime,
  statusLabels,
} from "../services/presentation";

function bodyOf(message: InboxMessage) {
  if (message.body) return message.body;
  const name = message.media.fileName ? ` · ${message.media.fileName}` : "";
  const labels: Record<string, string> = {
    image: "Imagem",
    video: "Vídeo",
    audio: "Áudio",
    document: "Documento",
    sticker: "Figurinha",
    location: "Localização",
    contact: "Contato",
  };
  return `[${labels[message.type] ?? "Mídia"}${name}]`;
}

export function InboxMessageList({
  messages,
  onRetry,
  retrying,
}: {
  messages: InboxMessage[];
  onRetry?: (message: InboxMessage) => void;
  retrying?: string;
}) {
  return (
    <>
      {messages.map((m, i) => (
        <div key={m.id}>
          {(!i ||
            messageDay(messages[i - 1].occurredAt) !==
              messageDay(m.occurredAt)) && (
            <div className="inbox-day-separator">
              <span>{messageDay(m.occurredAt)}</span>
            </div>
          )}
          <article
            className={`inbox-message ${m.direction}`}
            data-status={m.status}
            aria-label={`${m.direction === "inbound" ? "Recebida" : "Enviada"} às ${messageTime(m.occurredAt)}`}
          >
            <p>{bodyOf(m)}</p>
            <footer>
              <time dateTime={m.occurredAt}>{messageTime(m.occurredAt)}</time>
              {m.direction === "outbound" && (
                <span>
                  {m.origin === "external_device"
                    ? "Enviada pelo celular"
                    : statusLabels[m.status]}
                </span>
              )}
            </footer>
            {(m.status === "failed" || m.status === "uncertain") && (
              <div className="inbox-message-problem" role="alert">
                <TriangleAlert size={14} />
                <span>
                  {m.failureReason ??
                    (m.status === "failed"
                      ? "A mensagem não foi enviada."
                      : "Não foi possível confirmar o envio.")}
                </span>
                {onRetry && m.mine && m.requestId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retrying === m.id}
                    onClick={() => onRetry(m)}
                  >
                    <RotateCw size={13} />
                    {m.status === "failed"
                      ? "Tentar novamente"
                      : "Reenviar após conferir"}
                  </Button>
                )}
              </div>
            )}
          </article>
        </div>
      ))}
    </>
  );
}
