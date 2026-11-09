"use client";
import { useState } from "react";
import { LeadCreateDialog } from "./lead-create-dialog";
import { useDemo } from "@/components/layout/demo-context";
import { useClients } from "@/features/clients/hooks";
import { useLeads } from "@/features/leads/hooks";
import {
  Heading,
  Card,
  NavButton,
  Denied,
  Badge,
  dateTime,
  stageLabels,
  Empty,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { LeadTable } from "./lead-table";
import { FieldInput } from "@/features/forms/components/field-input";
import type { FieldValue } from "@/domain/schemas";
export function Leads() {
  const { clientId } = useDemo();
  const { data: clients, error: clientsError } = useClients();
  const [search, setSearch] = useState(""),
    [stage, setStage] = useState("all");
  const c = clients?.find((client) => client.id === clientId);
  const { data: leads = [], error: leadsError, isLoading, mutate } = useLeads({ clientId: c?.id ?? null, search, stage });
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <Heading
        title="Leads e CRM"
        description={`${c?.name ?? "Nenhum cliente selecionado"} · CRM administrativo.`}
        action={<Button disabled={!c} onClick={() => setDialogOpen(true)}>Novo lead</Button>}
      />
      {!c && <p role="status">Selecione um cliente no Workspace antes de cadastrar ou consultar Leads.</p>}
      {(clientsError || leadsError) && <div role="alert"><p>Não foi possível carregar os Leads reais.</p><Button variant="outline" size="sm" onClick={() => { void mutate(); }}>Tentar novamente</Button></div>}
      {isLoading && <p role="status">Carregando Leads…</p>}
      <div className="toolbar">
        <label>
          Buscar lead
          <input
            placeholder="Nome "
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Estágio
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(stageLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Card>
        {leadsError ? null : leads.length === 0 ? (
          search || stage !== "all" ? <Empty title="Nenhum resultado nos filtros" description="Ajuste a busca ou o estágio selecionado." /> : <Empty title="Nenhum lead cadastrado" description="Cadastre o primeiro lead manual deste cliente." />
        ) : <LeadTable leads={leads} />}
      </Card>
      {dialogOpen && c && <LeadCreateDialog client={c} onClose={() => setDialogOpen(false)} onCreated={() => { void mutate(); }} />}
    </>
  );
}
export function LeadDetail({ id }: { id: string }) {
  const { repositories, clientId, refresh } = useDemo();
  const [editing, setEditing] = useState<string | null>(null),
    [value, setValue] = useState<FieldValue>(null),
    [message, setMessage] = useState("");
  const lead = repositories.leads.list(clientId).find((l) => l.id === id);
  if (!lead) return <Denied />;
  const form = repositories.forms.get(clientId, lead.formId);
  const c = repositories.clients.get(clientId);
  return (
    <>
      <Heading
        eyebrow={c.name}
        title={lead.name}
        description="Contato e respostas do formulário"
        action={<NavButton href="/app/inbox">Abrir Inbox</NavButton>}
      />
      <div className="cards-grid">
        <Card title="Resumo">
          <Badge>{stageLabels[lead.stage]}</Badge>
          <p>Responsável: {lead.owner ?? "Não atribuído"}</p>
          <p>Próxima ação: {lead.nextAction}</p>
          <p>Telefone: {lead.contact?.phone || "Não informado"}</p>
          <p>E-mail: {lead.contact?.email || "Não informado"}</p>
          <Badge>
            {lead.captureStatus === "incomplete"
              ? "Cadastro incompleto"
              : lead.captureStatus === "in_progress"
                ? "Cadastro em andamento"
                : "Cadastro concluído"}
          </Badge>
          <NavButton href="/app/agendamentos">Agendamento espelhado</NavButton>
        </Card>
        <Card title="Origens">
          <h3>{form.name}</h3>
          <p>
            Versão {form.versions.find((v) => v.id === lead.versionId)?.number}{" "}
            · {dateTime(lead.createdAt)}
          </p>
          <p>{lead.source}</p>

          <p>
            <NavButton
              href={`/app/clientes/${clientId}/formularios/${form.id}/preview`}
            >
              Ver formulário de origem
            </NavButton>
          </p>
        </Card>
      </div>
      <Card title="Campos personalizados">
        <p className="muted">
          Catálogo desta clínica · valores com origem e histórico preservados.
        </p>
        {lead.fields.map((v) => {
          const f = repositories.fields.get(clientId, v.fieldDefinitionId);
          const display =
            v.value === null
              ? "Não informado"
              : typeof v.value === "boolean"
                ? v.value
                  ? "Sim"
                  : "Não"
                : Array.isArray(v.value)
                  ? v.value
                      .map((i) => f.options.find((o) => o.id === i)?.label ?? i)
                      .join(", ")
                  : (f.options.find((o) => o.id === v.value)?.label ??
                    String(v.value));
          return (
            <div className="field-row" key={f.id}>
              <div>
                <strong>
                  {form.versions
                    .find((version) => version.id === lead.versionId)
                    ?.steps.find((step) => step.question.id === v.questionId)
                    ?.question.label ?? f.label}
                </strong>
                <small>
                  {v.actor} · {dateTime(v.capturedAt)}
                  <br />
                  Campo {f.stableKey} · pergunta {v.questionId.slice(-5)} ·
                  submissão {v.submissionId.slice(-4)}
                </small>
              </div>
              {editing === f.id ? (
                <div>
                  <FieldInput field={f} value={value} onChange={setValue} />
                  <Button
                    size="sm"
                    onClick={() => {
                      try {
                        repositories.leads.editField(clientId, id, f.id, value);
                        refresh();
                        setEditing(null);
                        setMessage(
                          "Edição simulada em memória. Histórico atualizado.",
                        );
                      } catch {
                        setMessage("Valor inválido para este campo.");
                      }
                    }}
                  >
                    Salvar simulação
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div>
                  <span>{display}</span>{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(f.id);
                      setValue(v.value);
                    }}
                  >
                    Editar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        <p role="status">{message}</p>
      </Card>
      <Card title="Histórico">
        {lead.history.map((h) => (
          <div className="timeline" key={h.id}>
            <span />
            <div>
              <strong>{h.label}</strong>
              <small>{dateTime(h.at)}</small>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
