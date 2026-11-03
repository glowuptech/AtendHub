"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Badge, stageLabels } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { CalendarSchema, claimSla, clock, inBusinessTime } from "./calendar";
const stages = ["new", "in_progress", "waiting", "scheduled", "lost"] as const;
export function Queue() {
  const { scope, repositories, refresh, setClientId, calendar, setCalendar } =
      useDemo(),
    router = useRouter();
  const [now, setNow] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [draft, setDraft] = useState(calendar);
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
      <details className="queue-calendar">
        <summary>Calendário de atendimento · America/Sao_Paulo</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const result = CalendarSchema.safeParse({
              ...draft,
              holidays: draft.holidays.map((v) => v.trim()).filter(Boolean),
            });
            if (!result.success) {
              setMessage(result.error.issues[0].message);
              return;
            }
            setCalendar(result.data);
            setMessage(
              "Calendário atualizado nesta sessão. Prazos abertos serão recalculados.",
            );
          }}
        >
          <div className="toolbar">
            <label>
              Início do expediente
              <input
                type="time"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </label>
            <label>
              Fim do expediente
              <input
                type="time"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </label>
          </div>
          <fieldset>
            <legend>Dias úteis</legend>
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
              (label, i) => (
                <label className="queue-day" key={i}>
                  <input
                    type="checkbox"
                    checked={draft.days.includes(i)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days: e.target.checked
                          ? [...draft.days, i]
                          : draft.days.filter((d) => d !== i),
                      })
                    }
                  />
                  {label}
                </label>
              ),
            )}
          </fieldset>
          <label>
            Feriados e exceções (AAAA-MM-DD, um por linha)
            <textarea
              value={draft.holidays.join("\n")}
              onChange={(e) =>
                setDraft({ ...draft, holidays: e.target.value.split("\n") })
              }
            />
          </label>
          <Button
            type="submit"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                holidays: d.holidays.map((v) => v.trim()).filter(Boolean),
              }))
            }
          >
            Salvar calendário
          </Button>
        </form>
        <p>
          Expediente inicial: segunda a sexta, 09h às 17h. Cadastre os feriados
          da operação. A contagem pausa fora desses períodos.
        </p>
      </details>
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
                        setClientId(l.clientId);
                        router.push(`/app/leads/${l.id}`);
                      }}
                    >
                      Abrir lead
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
    </>
  );
}
