"use client";
import { UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, dateTime, stageLabels } from "@/components/layout/shared";
import type { InboxConversation } from "../model";
import { AssistantPanel } from "./assistant-panel";

export function ContextPanel({
  conversation,
  onInsert,
  onClose,
}: {
  conversation: InboxConversation;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const stage = stageLabels[conversation.stage as keyof typeof stageLabels];
  return (
    <div className="inbox-context-content">
      <section className="inbox-lead-summary" aria-label="Informações do lead">
        <header>
          <div>
            <UserRound size={17} />
            <h2>Informações do lead</h2>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Fechar informações e IA"
            onClick={onClose}
          >
            <X size={17} />
          </Button>
        </header>
        <div
          className="inbox-lead-details"
          tabIndex={0}
          aria-label="Resumo do lead"
        >
          <div className="inbox-lead-title">
            <strong>{conversation.contactName}</strong>
            <Badge>{stage ?? conversation.stage}</Badge>
          </div>
          <dl>
            <div>
              <dt>Telefone</dt>
              <dd>+{conversation.phone}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{conversation.clientName}</dd>
            </div>
            <div>
              <dt>Conexão</dt>
              <dd>
                {conversation.connection.name} · +
                {conversation.connection.phone}
              </dd>
            </div>
            <div>
              <dt>Profissional</dt>
              <dd>
                {conversation.professionalName || "Sem profissional vinculado"}
              </dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>
                {conversation.ownerName ||
                  (conversation.ownerId
                    ? conversation.mine
                      ? "Você"
                      : "Outro atendente"
                    : "Não atribuído")}
              </dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{conversation.source}</dd>
            </div>
            {conversation.lastMessageAt && (
              <div>
                <dt>Última mensagem</dt>
                <dd>{dateTime(conversation.lastMessageAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>
      <AssistantPanel
        key={conversation.id}
        clientName={conversation.clientName}
        conversationId={conversation.id}
        onInsert={onInsert}
      />
    </div>
  );
}
