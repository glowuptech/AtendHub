"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  CalendarPlus,
  ExternalLink,
  UserRound,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClients } from "@/features/clients/hooks";
import {
  WeeklyWorkspace,
  ScheduleDialog,
} from "@/features/appointments/components/weekly";
import { PersistedLeadDetail } from "@/features/leads/components/persisted-lead-detail";
import { RegistrationForm } from "@/features/leads/registration/form";
import { externalUrl } from "@/features/clients/accesses/model";
import { ConversationValue } from "./conversation-value";
import type { InboxConversation } from "../model";
export type Shortcut = "schedule" | "lead" | "registration" | "value";
export function ChatShortcuts({
  conversation,
  open,
  onOpen,
  onClose,
}: {
  conversation: InboxConversation;
  open: Shortcut | null;
  onOpen: (value: Shortcut) => void;
  onClose: () => void;
}) {
  const { data: clients, error: clientsError } = useClients();
  const client = clients?.find((c) => c.id === conversation.clientId);
  const endpoint = `/api/clients/${conversation.clientId}/scheduling`;
  const {
    data: scheduling,
    error: schedulingError,
    isLoading,
  } = useSWR<{ url: string; name: string }>(
    endpoint,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error ?? "Falha ao consultar agenda externa.");
      return body;
    },
    { revalidateOnFocus: false },
  );
  const [notice, setNotice] = useState("");
  const validLink =
    scheduling?.url && externalUrl.safeParse(scheduling.url).success;
  const titles = {
    schedule: "Agendar nesta conversa",
    lead: "Ficha do lead",
    registration: "Adicionar informações pessoais",
    value: "Valor do serviço nesta conversa",
  };
  return (
    <>
      <nav className="inbox-chat-shortcuts" aria-label="Atalhos da conversa">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpen("schedule")}
          title="Agendar com o lead desta conversa"
        >
          <CalendarPlus size={15} />
          Agendar
        </Button>
        {validLink ? (
          <a
            className="button button-outline button-sm"
            href={scheduling.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir agendamento externo"
            title={scheduling.name || "Agenda externa"}
          >
            <ExternalLink size={15} />
            Agenda externa
          </a>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading}
            onClick={() =>
              setNotice(
                schedulingError
                  ? "Não foi possível consultar a agenda externa. Tente novamente ou confira o perfil do cliente."
                  : "Cadastre a plataforma na aba Agendamento externo do perfil deste cliente.",
              )
            }
          >
            <ExternalLink size={15} />
            Agenda externa
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onOpen("lead")}>
          <UserRound size={15} />
          Abrir lead e campos
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpen("registration")}
        >
          <UserPlus size={15} />
          Adicionar informações
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpen("value")}>
          <Wallet size={15} />
          Vincular valor
        </Button>
      </nav>
      {notice && (
        <span className="inbox-shortcut-notice" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </span>
      )}
      {open && (
        <ScheduleDialog
          title={titles[open]}
          onClose={onClose}
          wide={open === "schedule"}
        >
          <p className="muted">
            {conversation.clientName} · {conversation.contactName}
          </p>
          {open === "schedule" ? (
            client ? (
              <WeeklyWorkspace
                clientId={client.id}
                clientName={client.name}
                doctors={client.doctors}
                initialLeadId={conversation.leadId}
                conversationId={conversation.id}
              />
            ) : (
              <p role={clientsError ? "alert" : "status"}>
                {clientsError
                  ? "Não foi possível carregar os profissionais do cliente."
                  : "Carregando agenda do cliente…"}
              </p>
            )
          ) : open === "lead" ? (
            <PersistedLeadDetail id={conversation.leadId} embedded />
          ) : open === "registration" ? (
            <RegistrationForm
              leadId={conversation.leadId}
              name={conversation.contactName}
            />
          ) : (
            <ConversationValue conversationId={conversation.id} />
          )}
        </ScheduleDialog>
      )}
    </>
  );
}
