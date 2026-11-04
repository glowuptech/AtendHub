"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Clock3 } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Badge } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { localDay, shiftDay } from "@/features/clients/services/overview";
import { endsAt, weekDays } from "@/features/appointments/services/schedule";
import { ScheduleDialog } from "@/features/appointments/components/weekly";
import {
  appointmentStatuses,
  appointmentTag,
  calendarEntries,
  sunday,
  dayTitle,
  clockTime,
} from "./data";
export function SystemCalendar() {
  const { repositories, scope, refresh } = useDemo();
  const today = localDay(new Date().toISOString());
  const [week, setWeek] = useState(() => sunday(today)),
    [clientFilter, setClientFilter] = useState("all"),
    [operation, setOperation] = useState("all"),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [opened, setOpened] = useState<{ clientId: string; id: string } | null>(
      null,
    ),
    [notice, setNotice] = useState("");
  const clients = repositories.clients.list(scope),
    days = weekDays(week);
  const entries = calendarEntries(repositories, scope, week).filter(
    ({ appointment: a, client, doctor }) =>
      (clientFilter === "all" || client.id === clientFilter) &&
      (operation === "all" || client.vertical === operation) &&
      (status === "all" || appointmentTag(a).id === status) &&
      `${a.name} ${client.name} ${doctor?.name ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const a = opened
    ? repositories.appointments.get(opened.clientId, opened.id)
    : null;
  const client = a ? repositories.clients.get(a.clientId) : null;
  const doctor =
    a && client
      ? client.doctors.find((d) => d.id === repositories.schedule.doctorId(a))
      : null;
  function move(offset: number) {
    setWeek(shiftDay(week, offset));
    setNotice("");
  }
  return (
    <>
      <Heading
        title="Calendário"
        eyebrow="SISTEMA"
        description="Agendamentos de todos os clientes autorizados · America/Sao_Paulo"
      />
      <div className="system-calendar-toolbar">
        <Button variant="outline" onClick={() => move(-7)}>
          <ChevronLeft size={16} />
          Anterior
        </Button>
        <div>
          <strong>
            Semana de{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(week + "T12:00:00Z"))}
          </strong>
          <small>
            {entries.length} agendamento{entries.length === 1 ? "" : "s"} no
            recorte
          </small>
        </div>
        <Button variant="outline" onClick={() => move(7)}>
          Próximo
          <ChevronRight size={16} />
        </Button>
      </div>
      <div className="system-calendar-filters">
        <label>
          Semana de
          <input
            type="date"
            value={week}
            onChange={(e) => {
              if (e.target.value) setWeek(sunday(e.target.value));
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => setWeek(sunday(today))}>
          Esta semana
        </Button>
        <label>
          Cliente
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="all">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operação
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="healthcare">Prescrita</option>
            <option value="legal">Veredite</option>
          </select>
        </label>
        <label>
          Etapa do agendamento
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas</option>
            <option value="unknown">Confirmação não informada</option>
            {Object.entries(appointmentStatuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="present">Compareceu</option>
            <option value="absent">Não compareceu</option>
          </select>
        </label>
        <label>
          Buscar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Contato, cliente ou profissional"
          />
        </label>
      </div>
      <div className="system-calendar-legend">
        <span data-operation="healthcare">● Prescrita</span>
        <span data-operation="legal">● Veredite</span>
        <span>Dia atual destacado em roxo</span>
      </div>
      {notice && (
        <p role="status" className="team-note">
          {notice}
        </p>
      )}
      <div
        className="system-calendar-scroll"
        tabIndex={0}
        aria-label="Calendário semanal de todos os clientes"
      >
        <div className="system-calendar-week">
          {days.map((day) => {
            const daily = entries.filter(
              (e) => localDay(e.appointment.scheduledAt) === day,
            );
            return (
              <section
                key={day}
                className="system-calendar-day"
                data-today={day === today}
                aria-label={dayTitle(day) + " " + day}
                aria-current={day === today ? "date" : undefined}
              >
                <header>
                  <span>{dayTitle(day)}</span>
                  <strong>{Number(day.slice(8))}</strong>
                  {day === today && (
                    <small className="system-calendar-today">Hoje</small>
                  )}
                  <p>
                    {daily.length} agendamento{daily.length === 1 ? "" : "s"}
                  </p>
                </header>
                <div className="system-calendar-cards">
                  {daily.map(({ appointment: a, client, doctor }) => {
                    const tag = appointmentTag(a);
                    return (
                      <button
                        key={a.id}
                        className="system-appointment-card"
                        data-operation={client.vertical}
                        onClick={() => {
                          setOpened({ clientId: client.id, id: a.id });
                          setNotice("");
                        }}
                      >
                        <span className="system-appointment-time">
                          <Clock3 size={12} />
                          {clockTime(a.scheduledAt)}
                          {a.endsAt && `–${clockTime(a.endsAt)}`}
                        </span>
                        <strong>{a.name}</strong>
                        <span className="system-appointment-client">
                          {client.name}
                        </span>
                        <small>
                          {doctor?.name ?? "Sem profissional vinculado"}
                        </small>
                        <span className="system-appointment-operation">
                          {client.vertical === "healthcare"
                            ? "Prescrita"
                            : "Veredite"}
                        </span>
                        <Badge tone={tag.tone}>{tag.label}</Badge>
                      </button>
                    );
                  })}
                  {!daily.length && (
                    <div className="system-calendar-empty">
                      <CalendarDays size={20} />
                      <p>Sem agendamentos</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="system-calendar-note">
        Confirmação e comparecimento pertencem ao agendamento. A etapa do lead
        não altera automaticamente essas informações. Dados em memória, sem
        sincronização externa.
      </p>
      {a && client && (
        <ScheduleDialog
          title="Agendamento do calendário"
          onClose={() => setOpened(null)}
        >
          <h3>{a.name}</h3>
          <p>
            {client.name} ·{" "}
            {client.vertical === "healthcare" ? "Prescrita" : "Veredite"}
          </p>
          <p>{doctor?.name ?? "Sem profissional vinculado"}</p>
          <p>
            {localDay(a.scheduledAt).split("-").reverse().join("/")} ·{" "}
            {clockTime(a.scheduledAt)}–{clockTime(endsAt(a))}
          </p>
          {!a.endsAt && (
            <small>
              Duração de referência de 30 minutos para registro anterior sem
              término informado.
            </small>
          )}
          <label>
            Confirmação / andamento
            <select
              value={a.status ?? "unknown"}
              onChange={(e) => {
                if (e.target.value === "unknown") return;
                repositories.appointments.setStatus(
                  a.clientId,
                  a.id,
                  e.target.value as NonNullable<typeof a.status>,
                );
                refresh();
                setNotice("Etapa do agendamento atualizada nesta sessão.");
              }}
            >
              <option value="unknown" disabled>
                Não informada
              </option>
              {Object.entries(appointmentStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparecimento
            <select
              value={a.attendance}
              onChange={(e) => {
                repositories.appointments.setAttendance(
                  a.clientId,
                  a.id,
                  e.target.value as typeof a.attendance,
                );
                refresh();
                setNotice("Comparecimento atualizado nesta sessão.");
              }}
            >
              <option value="unknown">Não informado</option>
              <option value="present">Compareceu</option>
              <option value="absent">Não compareceu</option>
            </select>
          </label>
          <p className="preserve-lines">{a.notes}</p>
          <small>
            Marcar “Em reagendamento” mantém o horário reservado até um fluxo de
            remarcação ser definido.
          </small>
        </ScheduleDialog>
      )}
    </>
  );
}
