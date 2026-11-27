"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/features/clients/hooks";
import { clientCategories, clientOperations } from "@/features/clients/operation";
import { useLeads } from "@/features/leads/hooks";
import { Heading, Badge, stageLabels } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import {
  CLAIM_TARGET_MINUTES,
  claimSla,
  clock,
  inBusinessTime,
} from "./calendar";
import { useBoardPan } from "./use-board-pan";
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
  const boardPan = useBoardPan();
  const claimLock = useRef(false);
  const {
    calendar,
    error: calendarError,
    isConfigured,
    isReady,
    isLoading: calendarLoading,
  } = useServiceCalendar();
  const { data: clients = [], error: clientsError } = useClients();
  const {
    data: persistedLeads = [],
    error: leadsError,
    mutate: mutateLeads,
  } = useLeads();
  const [now, setNow] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [claimingId, setClaimingId] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    // Also update immediately after a background tab or suspended machine resumes.
    const initial = setTimeout(update, 0);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const paused = isReady && now !== null && !inBusinessTime(now, calendar);
  const leads = persistedLeads
    .map((lead) => ({
      ...lead,
      client: clients.find((client) => client.id === lead.client_id),
    }))
    .filter(
      (lead): lead is typeof lead & { client: (typeof clients)[number] } =>
        Boolean(lead.client),
    )
    .filter(
      (l) =>
        (!filter || l.client_id === filter) &&
        `${l.name} ${l.client.name} ${l.phone}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      (b.stage_entered_at ?? b.queue_entered_at ?? b.created_at).localeCompare(
        a.stage_entered_at ?? a.queue_entered_at ?? a.created_at,
      ),
    );
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Fila de atendimento"
        description="Todos os clientes autorizados · mais recentes primeiro"
      />
      {(clientsError || leadsError) && (
        <p role="alert">
          Não foi possível atualizar a fila real. Tente novamente.
        </p>
      )}
      {calendarError && (
        <p role="alert">
          Não foi possível carregar o calendário de SLA. O prazo está
          indisponível; você ainda pode assumir atendimentos autorizados.
        </p>
      )}
      {!isConfigured && isReady && (
        <p role="status">
          Usando calendário padrão: segunda a sexta, das 09:00 às 17:00
          (America/Sao_Paulo). Salve os horários e feriados da empresa em
          Configurações → Calendário de atendimento.
        </p>
      )}
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
        <Badge>Prazo para assumir: {CLAIM_TARGET_MINUTES} minutos úteis</Badge>
        {paused && <Badge>Relógio pausado · fora do expediente</Badge>}
      </div>
      <p role="status">{message}</p>
      <div
        {...boardPan}
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
                const sla =
                  isReady && now !== null
                    ? claimSla(
                        l.queue_entered_at ?? l.created_at,
                        now,
                        calendar,
                      )
                    : null;
                return (
                  <article className="queue-card" key={l.id}>
                    <small className="queue-client">{l.client.name}</small>
                    <span className="client-operation-badge" data-vertical={l.client.vertical}>
                      {clientCategories[l.client.category]} · {clientOperations[l.client.vertical].name}
                    </span>
                    <h3>{l.name}</h3>
                    <p>{l.phone || "Telefone não informado"}</p>
                    <small>Origem: {l.source}</small>
                    {l.qualified_at && (
                      <Badge>Qualificado · confirmou a consulta</Badge>
                    )}
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
                              ? clock(sla.remainingMs)
                              : calendarLoading || (isReady && now === null)
                                ? "Calculando prazo…"
                                : "Prazo indisponível"}
                          </strong>
                          <small>
                            {sla?.overdue
                              ? "Lead sem atendimento · atenção"
                              : sla && paused
                                ? "Pausado · aguarda o próximo expediente"
                                : "Tempo útil para assumir"}
                          </small>
                        </div>
                        <Button
                          disabled={claimingId !== null}
                          onClick={async () => {
                            if (claimLock.current) return;
                            claimLock.current = true;
                            setClaimingId(l.id);
                            setMessage("");
                            try {
                              const response = await fetch(
                                `/api/leads/${l.id}/claim`,
                                { method: "POST" },
                              );
                              const body = await response
                                .json()
                                .catch(() => null);
                              if (!response.ok) {
                                setMessage(
                                  body?.error ??
                                    "Não foi possível assumir este atendimento. Tente novamente.",
                                );
                                if (response.status === 409)
                                  await mutateLeads();
                                return;
                              }
                              setMessage(
                                `Atendimento de ${l.name} assumido e salvo.`,
                              );
                              await mutateLeads();
                            } catch {
                              setMessage(
                                "Não foi possível confirmar a assunção. Atualize a fila antes de tentar novamente.",
                              );
                            } finally {
                              claimLock.current = false;
                              setClaimingId(null);
                            }
                          }}
                        >
                          {claimingId === l.id
                            ? "Assumindo…"
                            : "Assumir atendimento"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p>
                          Responsável:{" "}
                          <strong>
                            {l.owner_name || "Responsável da equipe"}
                          </strong>
                        </p>
                        {l.claimed_at && <Badge>Atendimento assumido</Badge>}
                        <label>
                          Mover {l.name}
                          <select
                            value={l.stage}
                            onChange={async (e) => {
                              const response = await fetch(
                                `/api/leads/${l.id}/stage`,
                                {
                                  method: "POST",
                                  headers: {
                                    "content-type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    stage: e.target.value,
                                  }),
                                },
                              );
                              if (!response.ok)
                                setMessage(
                                  "Não foi possível mover este atendimento.",
                                );
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
                        onClick={() => router.push(`/app/inbox?leadId=${l.id}`)}
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
