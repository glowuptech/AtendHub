"use client";
import { useEffect, useState } from "react";
import { LeadModal } from "./lead-modal";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Badge, stageLabels } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { claimSla, clock, inBusinessTime } from "./calendar";
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
  const {
      scope,
      repositories,
      refresh,
      setClientId,
      setInboxLeadId,
      calendar,
    } = useDemo(),
    router = useRouter();
  const [opened, setOpened] = useState<{ clientId: string; id: string } | null>(
    null,
  );
  function converse(clientId: string, id: string) {
    const lead = repositories.leads.get(clientId, id);
    repositories.inbox.ensure(clientId, lead);
    setClientId(clientId);
    setInboxLeadId(id);
    refresh();
    router.push("/app/inbox");
  }
  const [now, setNow] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const clients = repositories.clients.list(scope);
  const leads = clients
    .flatMap((c) =>
      repositories.leads.list(c.id).map((l) => ({ ...l, client: c })),
    )
    .filter(
      (l) =>
        (!filter || l.clientId === filter) &&
        `${l.name} ${l.client.name} ${l.contact?.phone ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Fila de atendimento"
        description="Todos os clientes · prioridade para quem está aguardando"
      />
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
        {now && !inBusinessTime(now, calendar) && (
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
                const sla = now ? claimSla(l.createdAt, now, calendar) : null;
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
                    <p>{l.contact?.phone || "Telefone não informado"}</p>
                    <small>Origem: {l.source}</small>
                    {l.captureStatus && l.captureStatus !== "completed" && (
                      <Badge>
                        {l.captureStatus === "incomplete"
                          ? "Cadastro incompleto"
                          : "Cadastro em andamento"}
                      </Badge>
                    )}
                    {!l.owner ? (
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
                          onClick={() => {
                            try {
                              repositories.leads.claim(
                                l.clientId,
                                l.id,
                                calendar,
                              );
                              refresh();
                              setMessage(
                                `Atendimento de ${l.name} atribuído em memória à Operadora.`,
                              );
                            } catch (e) {
                              setMessage(
                                e instanceof Error
                                  ? e.message
                                  : "Não foi possível assumir",
                              );
                            }
                          }}
                        >
                          Assumir atendimento
                        </Button>
                      </>
                    ) : (
                      <>
                        <p>
                          Responsável: <strong>{l.owner}</strong>
                        </p>
                        {l.claimAudit && (
                          <Badge>
                            {l.claimAudit.late
                              ? "Assumido após o prazo"
                              : "Assumido no prazo"}
                          </Badge>
                        )}
                        <label>
                          Mover {l.name}
                          <select
                            value={l.stage}
                            onChange={(e) => {
                              try {
                                repositories.leads.setStage(
                                  l.clientId,
                                  l.id,
                                  e.target.value as typeof l.stage,
                                );
                                refresh();
                              } catch (e) {
                                setMessage(String(e));
                              }
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
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setOpened({ clientId: l.clientId, id: l.id });
                      }}
                    >
                      Abrir lead
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => converse(l.clientId, l.id)}
                    >
                      Conversar
                    </Button>
                  </article>
                );
              })}
            {!leads.some((l) => l.stage === stage) && (
              <p className="muted">Nenhum lead</p>
            )}
          </section>
        ))}
      </div>
      {opened && (
        <LeadModal
          clientId={opened.clientId}
          id={opened.id}
          onClose={() => setOpened(null)}
          onConverse={() => converse(opened.clientId, opened.id)}
        />
      )}
    </>
  );
}
