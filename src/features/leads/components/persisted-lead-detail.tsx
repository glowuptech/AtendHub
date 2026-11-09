"use client";
import { useLead } from "@/features/leads/hooks";
import { Badge, Card, Denied, Heading, NavButton, dateTime, stageLabels } from "@/components/layout/shared";

export function PersistedLeadDetail({ id }: { id: string }) {
  const { data: lead, error, isLoading } = useLead(id);
  if (isLoading) return <p role="status">Carregando Lead…</p>;
  if (error || !lead) return <Denied />;
  return (
    <>
      <Heading eyebrow={lead.client?.name ?? "Cliente"} title={lead.name} description="Lead persistido no Supabase" action={<NavButton href="/app/inbox">Abrir Inbox</NavButton>} />
      <div className="cards-grid">
        <Card title="Resumo">
          <Badge>{stageLabels[lead.stage]}</Badge>
          <p>Responsável: {lead.owner_id ? "Atendimento atribuído" : "Não atribuído"}</p>
          <p>Telefone: {lead.phone || "Não informado"}</p>
          <p>E-mail: {lead.email || "Não informado"}</p>
          <p>Próxima ação: {lead.next_action || "Nenhuma ação registrada"}</p>
          <Badge>{lead.capture_status === "completed" ? "Cadastro concluído" : lead.capture_status === "incomplete" ? "Cadastro incompleto" : "Cadastro em andamento"}</Badge>
        </Card>
        <Card title="Origem">
          <p>{lead.source}</p>
          <p>Criado em {dateTime(lead.created_at)}</p>
          <p>Operação: {lead.client?.operation_id ?? "Não informada"}</p>
          <p>Formulário público: {lead.form_id ? "Vinculado" : "Ainda não conectado"}</p>
        </Card>
      </div>
      <Card title="Histórico">
        {!lead.events?.length && <p>Nenhuma movimentação registrada.</p>}
        {lead.events?.map((event) => (
          <div className="timeline" key={event.id}>
            <span />
            <div>
              <strong>{event.event_type === "stage_changed" ? `Etapa: ${event.from_stage ?? "—"} → ${event.to_stage ?? "—"}` : event.event_type === "assigned" ? "Atendimento assumido" : "Cadastro criado ou editado"}</strong>
              <small>{dateTime(event.created_at)}</small>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
