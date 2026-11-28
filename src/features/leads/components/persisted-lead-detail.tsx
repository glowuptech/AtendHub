"use client";
import { useState } from "react";
import { useInboxMessages } from "@/features/inbox/hooks";
import { BookingConversationPreview } from "@/features/inbox/components/booking-conversation-preview";
import { RegistrationForm } from "@/features/leads/registration/form";
import { useLead } from "@/features/leads/hooks";
import {
  Badge,
  Card,

  Heading,
  NavButton,
  dateTime,
  stageLabels,
} from "@/components/layout/shared";

function LeadConversation({ id, name }: { id: string; name: string }) {
  const history = useInboxMessages(id);
  return <BookingConversationPreview contactName={name} history={history} />;
}

export function PersistedLeadDetail({
  id,
  embedded = false,
  conversationId,
}: {
  id: string;
  embedded?: boolean;
  conversationId?: string;
}) {
  const { data: lead, error, isLoading } = useLead(id);
  const [selected, setSelected] = useState("");
  const conversations = lead?.conversations ?? [];
  const active = conversationId ?? (conversations.find(c => c.id === selected)?.id || conversations[0]?.id);
  if (isLoading) return <p role="status">Carregando Lead…</p>;
  if (error || !lead) return <p role="alert">{error?.message || "Lead indisponível para esta sessão."}</p>;
  return (
    <>
      {!embedded && (
        <Heading
          eyebrow={lead.client?.name ?? "Cliente"}
          title={lead.name}
          description="Lead persistido no Supabase"
          action={<NavButton href="/app/inbox">Abrir Inbox</NavButton>}
        />
      )}
      {embedded && <h3>{lead.name}</h3>}
      {lead.warnings?.map(message => <p role="alert" key={message}>{message}</p>)}
      <div className="cards-grid">
        <Card title="Resumo">
          <Badge>{stageLabels[lead.stage]}</Badge>
          <p>
            Responsável:{" "}
            {lead.owner_id ? "Atendimento atribuído" : "Não atribuído"}
          </p>
          <p>Telefone: {lead.phone || "Não informado"}</p>
          <p>E-mail: {lead.email || "Não informado"}</p>
          <p>Observações: {lead.notes || "Nenhuma"}</p>
          <Badge>
            {lead.capture_status === "completed"
              ? "Cadastro concluído"
              : lead.capture_status === "incomplete"
                ? "Cadastro incompleto"
                : "Cadastro em andamento"}
          </Badge>
        </Card>
        <Card title="Origem e horários">
          <p>Fonte: {lead.source}</p>
          <p>
            Formulário:{" "}
            {lead.form_id
              ? `Vinculado · versão ${lead.form_version_id ?? "não informada"}`
              : "Cadastro sem formulário"}
          </p>
          <p>
            Data original:{" "}
            {lead.original_captured_at
              ? dateTime(lead.original_captured_at)
              : "Não informada"}
          </p>
          <p>Inserido no sistema: {dateTime(lead.created_at)}</p>
          <p>Entrada na fila: {lead.queue_entered_at ? dateTime(lead.queue_entered_at) : "Não informada"}</p>
        </Card>
      </div>
      <Card title="Perguntas e respostas">
        <p className="muted">
          As perguntas abaixo são snapshots da versão usada no cadastro.
        </p>
        {lead.responses?.length ? (
          lead.responses.map((response) => {
            const snapshot = response.question_snapshot ?? {};
            const value = Array.isArray(response.value)
              ? response.value
                  .map(
                    (item) =>
                      snapshot.options?.find((option) => option.id === item)
                        ?.label ?? String(item),
                  )
                  .join(", ")
              : response.value === null ||
                  response.value === undefined ||
                  response.value === ""
                ? "Não informado"
                : typeof response.value === "boolean"
                  ? response.value
                    ? "Sim"
                    : "Não"
                  : String(response.value);
            return (
              <div className="field-row" key={response.id}>
                <div>
                  <strong>{snapshot.label ?? response.question_id}</strong>
                  {response.captured_at && <small>{dateTime(response.captured_at)}</small>}
                </div>
                <span>{value}</span>
              </div>
            );
          })
        ) : lead.responses ? (
          <p>Nenhuma resposta personalizada registrada.</p>
        ) : null}
      </Card>
      <Card title="Dados pessoais">
        <RegistrationForm key={id} leadId={id} name={lead.name} />
      </Card>
      <Card title="Histórico de mensagens">
        {!conversationId && conversations.length > 1 && <label>Conversa
          <select value={active} onChange={e => setSelected(e.target.value)}>
            {conversations.map((c, index) => <option key={c.id} value={c.id}>Conversa {index + 1}</option>)}
          </select>
        </label>}
        {active ? <LeadConversation key={active} id={active} name={lead.name} /> :
          <p>Nenhuma conversa disponível para esta sessão.</p>}
      </Card>
      <Card title="Histórico de movimentações">
        {lead.events && !lead.events.length && <p>Nenhuma movimentação registrada.</p>}
        {lead.events?.map((event) => (
          <div className="timeline" key={event.id}>
            <span />
            <div>
              <strong>
                {event.event_type === "stage_changed"
                  ? `Etapa: ${event.from_stage ?? "—"} → ${event.to_stage ?? "—"}`
                  : event.event_type === "assigned"
                    ? "Atendimento assumido"
                    : "Cadastro criado ou editado"}
              </strong>
              <small>{dateTime(event.created_at)}</small>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
