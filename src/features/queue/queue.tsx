"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/features/clients/hooks";
import { useLeads } from "@/features/leads/hooks";
import { Heading, Badge, stageLabels } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { claimSla, clock, inBusinessTime } from "./calendar";
import { useServiceCalendar } from "./use-service-calendar";
const stages = [
  "new",
  "in_progress",
  "waiting",
  "awaiting_scheduling",
  "scheduled",
  "confirmed",
  "rescheduling",
  "recovery",
  "lost",
] as const;
export function Queue() {
  const router = useRouter();
  const { calendar, error: calendarError, isConfigured } = useServiceCalendar();
  const { data: clients = [], error: clientsError } = useClients();
  const { data: persistedLeads = [], error: leadsError, mutate: mutateLeads } = useLeads();
  function converse() {
    setMessage("O Inbox ainda não está conectado a um provedor de mensagens. Nenhuma mensagem foi simulada.");
  }
  const [now, setNow] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const leads = persistedLeads
    .map((lead) => ({ ...lead, client: clients.find((client) => client.id === lead.client_id) }))
    .filter((lead): lead is typeof lead & { client: (typeof clients)[number] } => Boolean(lead.client))
    .filter(
      (l) =>
        (!filter || l.client_id === filter) &&
        `${l.name} ${l.client.name} ${l.phone}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Fila de atendimento"
        description="Todos os clientes autorizados · prioridade para quem está aguardando"
      />
      {(clientsError || leadsError || calendarError) && <p role="alert">Não foi possível atualizar a fila real. Tente novamente.</p>}
      {!isConfigured && !calendarError && <p role="status">O calendário de SLA ainda não foi configurado para esta organização.</p>}
      <div className="toolbar">
        <label>
          Buscar lead ou cliente
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Cliente
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Badge>Prazo para assumir: 10 minutos úteis</Badge>
        {isConfigured && now && !inBusinessTime(now, calendar) && (
          <Badge>Relógio pausado · fora do expediente</Badge>
        )}
      </div>
      <p role="status">{message}</p>
      <div
        className="queue-board"
        tabIndex={0}
        role="region"
        aria-label="Kanban de atendimento"
      >
        {stages.map((stage) => (
          <section
            className="queue-column"
            data-stage={stage}
            key={stage}
            aria-label={
              stage === "new" ? "Sem atendimento" : stageLabels[stage]
            }
          >
            <header>
              <h2>
                {stage === "new" ? "Sem atendimento" : stageLabels[stage]}
              </h2>
              <Badge>{leads.filter((l) => l.stage === stage).length}</Badge>
            </header>
            {leads
              .filter((l) => l.stage === stage)
              .map((l) => {
                const sla = isConfigured && now ? claimSla(l.created_at, now, calendar) : null;
                return (
                  <article className="queue-card" key={l.id}>
                    <small className="queue-client">{l.client.name}</small>
                    <Badge>
                      {l.client.category === "clinic"
                        ? "Clínica · Saúde"
                        : l.client.category === "doctor_female"
                          ? "Médica · Saúde"
                          : "Médico · Saúde"}
                    </Badge>
                    <h3>{l.name}</h3>
                    <p>{l.phone || "Telefone não informado"}</p>
                    <small>Origem: {l.source}</small>
                    {l.capture_status && l.capture_status !== "completed" && (
                      <Badge>
                        {l.capture_status === "incomplete"
                          ? "Cadastro incompleto"
                          : "Cadastro em andamento"}
                      </Badge>
                    )}
                    {!l.owner_id ? (
                      <>
                        <div
                          className={`queue-clock ${sla?.overdue ? "late" : ""}`}
                        >
                          <strong>
                            {sla
                              ? sla.overdue
                                ? `Atraso ${clock(sla.elapsedMs - 600000)}`
                                : `${clock(sla.remainingMs)} restantes`
                              : "Calculando prazo…"}
                          </strong>
                          <small>Tempo útil para assumir</small>
                        </div>
                        <Button
                          disabled={!isConfigured}
                          onClick={async () => {
                            const response = await fetch(`/api/leads/${l.id}/claim`, { method: "POST" });
                            if (response.ok) {
                              await mutateLeads();
                              setMessage(`Atendimento de ${l.name} assumido e salvo.`);
                            } else {
                              const body = await response.json().catch(() => null);
                              setMessage(body?.error ?? "Este atendimento já foi assumido por outra pessoa.");
                              await mutateLeads();
                            }
                          }}
                        >
                          Assumir atendimento
                        </Button>
                      </>
                    ) : (
                      <>
                        <p>
                          Responsável: <strong>{l.owner_id}</strong>
                        </p>
                        {l.claimed_at && <Badge>Atendimento assumido</Badge>}
                        <label>
                          Mover {l.name}
                          <select
                            value={l.stage}
                            onChange={async (e) => {
                              const response = await fetch(`/api/leads/${l.id}/stage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: e.target.value }) });
                              if (!response.ok) setMessage("Não foi possível mover este atendimento.");
                              await mutateLeads();
                            }}
                          >
                            {stages
                              .filter((s) => s !== "new")
                              .map((s) => (
                                <option key={s} value={s}>
                                  {stageLabels[s]}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    )}
                    <div className="queue-card-actions">
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/app/leads/${l.id}`)}
                      >
                        Abrir lead
                      </Button>
                      <Button
                        variant="outline"
                        onClick={converse}
                      >
                        Conversar
                      </Button>
                    </div>
                  </article>
                );
              })}
            {!leads.some((l) => l.stage === stage) && (
              <p className="muted">Nenhum lead</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
