"use client";
import { UserRound, ExternalLink, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, dateTime, stageLabels } from "@/components/layout/shared";
import type {
  AppointmentMirror,
  Client,
  Conversation,
  Lead,
} from "@/domain/schemas";
import { lastMessage } from "../services/presentation";
import { AssistantPanel } from "./assistant-panel";
export function ContextPanel({
  client,
  lead,
  conversation,
  appointments,
  onOpenLead,
  onEdit,
  onInsert,
  onClose,
}: {
  client: Client;
  lead: Lead;
  conversation: Conversation;
  appointments: AppointmentMirror[];
  onOpenLead: () => void;
  onEdit: () => void;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const doctor = client.doctors.find((d) => d.id === lead.doctorId);
  const last = lastMessage(conversation);
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
            <strong>
              {lead.name || lead.contact?.phone || "Contato sem nome"}
            </strong>
            <Badge>{stageLabels[lead.stage]}</Badge>
          </div>
          <dl>
            <div>
              <dt>Telefone</dt>
              <dd>{lead.contact?.phone || "Não informado"}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{client.name}</dd>
            </div>
            <div>
              <dt>Profissional</dt>
              <dd>{doctor?.name || "Sem profissional vinculado"}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{lead.owner || "Não atribuído"}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{lead.source}</dd>
            </div>
            {last && (
              <div>
                <dt>Última mensagem</dt>
                <dd>{dateTime(last.at)}</dd>
              </div>
            )}
          </dl>
          {appointments.length > 0 && (
            <details>
              <summary>Agendamentos ({appointments.length})</summary>
              {appointments.map((a) => (
                <p key={a.id}>
                  {dateTime(a.scheduledAt)}
                  <small>
                    {a.attendance === "present"
                      ? "Compareceu"
                      : a.attendance === "absent"
                        ? "Não compareceu"
                        : "Presença não informada"}
                  </small>
                </p>
              ))}
            </details>
          )}
          <a
            className="inbox-external-agenda"
            href={client.externalSchedulingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir agenda externa <ExternalLink size={12} />
          </a>
          <small>Link de prévia; a agenda oficial é externa.</small>
        </div>
        <div className="inbox-lead-actions">
          <Button variant="outline" size="sm" onClick={onOpenLead}>
            <ExternalLink size={14} />
            Abrir lead e campos
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil size={14} />
            Editar cadastro
          </Button>
        </div>
      </section>
      <AssistantPanel
        key={conversation.id}
        client={client}
        conversationId={conversation.id}
        onInsert={onInsert}
      />
    </div>
  );
}
