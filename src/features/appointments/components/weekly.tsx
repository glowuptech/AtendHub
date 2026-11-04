"use client";
import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Badge, Empty, dateTime } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { localDay, shiftDay } from "@/features/clients/services/overview";
import {
  weekDays,
  monday,
  timeLabel,
  endsAt,
  overlaps,
  minutes,
  type Booking,
} from "../services/schedule";
import { AvailabilityEditor, shortDay } from "./availability";
import type { AppointmentMirror } from "@/domain/schemas";
import { z } from "zod";
export function WeeklyAppointments() {
  const { clientId } = useDemo();
  return <WeeklyWorkspace key={clientId} />;
}
function WeeklyWorkspace() {
  const { repositories, clientId, refresh } = useDemo();
  const client = repositories.clients.get(clientId),
    schedule = repositories.schedule;
  const [doctor, setDoctor] = useState(client.doctors[0]?.id ?? ""),
    [week, setWeek] = useState(() =>
      monday(localDay(new Date().toISOString())),
    ),
    [config, setConfig] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null),
    [opened, setOpened] = useState<AppointmentMirror | null>(null);
  const days = weekDays(week),
    all = schedule.list(clientId),
    availability = doctor ? schedule.get(clientId, doctor, week) : null;
  const weekAppointments = all.filter((a) =>
      days.includes(localDay(a.scheduledAt)),
    ),
    appointments = weekAppointments.filter(
      (a) => schedule.doctorId(a) === doctor,
    ),
    unassigned = weekAppointments.filter((a) => !schedule.doctorId(a));
  const slotSet = new Set(availability?.slots ?? []);
  const rawMinutes = [
    ...(availability?.slots ?? []).map((s) => minutes(s.slice(11))),
    ...appointments.map((a) => {
      const d = new Date(a.scheduledAt);
      return (
        Number(
          new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            hourCycle: "h23",
            timeZone: "America/Sao_Paulo",
          }).format(d),
        ) *
          60 +
        Number(
          new Intl.DateTimeFormat("en-GB", {
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          }).format(d),
        )
      );
    }),
  ];
  const from = Math.min(480, ...rawMinutes),
    to = Math.min(
      1440,
      Math.max(
        1080,
        ...rawMinutes.map((n) => n + 60),
        ...appointments.map((a) => {
          const local = new Date(Date.parse(endsAt(a)) - 3 * 3600000);
          return local.getUTCHours() * 60 + local.getUTCMinutes() || 1440;
        }),
      ),
    );
  const rows = Array.from(
    { length: Math.ceil((to - from) / (availability?.displayStep ?? 30)) },
    (_, i) => from + i * (availability?.displayStep ?? 30),
  );
  function newBooking(day = days[0], time = "08:00") {
    setError("");
    setBooking({
      id: crypto.randomUUID(),
      doctorId: doctor,
      leadId: "",
      day,
      time,
      duration: availability?.defaultDuration ?? 30,
      notes: "",
    });
  }
  function saveBooking() {
    if (!booking) return;
    try {
      schedule.book(clientId, booking);
      refresh();
      setBooking(null);
      setNotice(
        "Agendamento salvo. Evento de notificação registrado na fila em memória; envio externo pendente.",
      );
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "Confira os campos.",
      );
    }
  }
  function attendance(
    a: AppointmentMirror,
    value: AppointmentMirror["attendance"],
  ) {
    repositories.appointments.setAttendance(clientId, a.id, value);
    refresh();
    setOpened({ ...a, attendance: value });
    setNotice("Comparecimento atualizado nesta sessão.");
  }
  return (
    <>
      <Heading
        title="Agendamentos"
        eyebrow="WORKSPACE"
        description={`${client.name} · agenda por profissional · America/Sao_Paulo`}
        action={
          <Button disabled={!doctor} onClick={() => newBooking()}>
            <Plus size={16} />
            Criar agendamento
          </Button>
        }
      />
      <div className="schedule-toolbar">
        <label>
          Profissional
          <select
            value={doctor}
            onChange={(e) => {
              setDoctor(e.target.value);
              setConfig(false);
              setError("");
            }}
          >
            {!client.doctors.length && (
              <option value="">Nenhum profissional cadastrado</option>
            )}
            {client.doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="schedule-week-nav">
          <Button
            variant="outline"
            size="icon"
            aria-label="Semana anterior"
            onClick={() => {
              setWeek(shiftDay(week, -7));
              setConfig(false);
            }}
          >
            <ChevronLeft size={17} />
          </Button>
          <label>
            Semana de
            <input
              type="date"
              value={week}
              onChange={(e) => {
                if (e.target.value) {
                  setWeek(monday(e.target.value));
                  setConfig(false);
                }
              }}
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próxima semana"
            onClick={() => {
              setWeek(shiftDay(week, 7));
              setConfig(false);
            }}
          >
            <ChevronRight size={17} />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setWeek(monday(localDay(new Date().toISOString())));
              setConfig(false);
            }}
          >
            Esta semana
          </Button>
        </div>
        <Button
          variant="outline"
          disabled={!doctor}
          onClick={() => setConfig(!config)}
        >
          <SlidersHorizontal size={16} />
          Configurar disponibilidade
        </Button>
      </div>
      <div className="schedule-caption">
        <strong>
          {shortDay(days[0])} a {shortDay(days[6])}
        </strong>
        <div className="schedule-legend">
          <span>
            <i data-state="free" />
            Disponível
          </span>
          <span>
            <i data-state="blocked" />
            Indisponível
          </span>
          <span>
            <i data-state="booked" />
            Agendado
          </span>
        </div>
      </div>
      {notice && (
        <p className="team-note" role="status">
          {notice}
        </p>
      )}
      {config && availability && (
        <AvailabilityEditor
          key={`${clientId}:${doctor}:${week}`}
          value={availability}
          onCancel={() => setConfig(false)}
          onSave={(value) => {
            try {
              schedule.save(clientId, value);
              refresh();
              setConfig(false);
              setNotice("Disponibilidade salva para esta semana.");
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Confira os horários.");
            }
          }}
        />
      )}
      {error && !booking && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {!doctor ? (
        <Empty
          title="Cadastre um profissional para configurar a agenda"
          description="Adicione os profissionais nas informações do cliente."
        />
      ) : (
        <>
          <div
            className="schedule-board"
            tabIndex={0}
            aria-label="Agenda semanal do profissional"
          >
            <div
              className="schedule-grid"
              data-has-today={days.includes(localDay(new Date().toISOString()))}
              style={
                {
                  "--today-index": days.indexOf(
                    localDay(new Date().toISOString()),
                  ),
                } as React.CSSProperties
              }
            >
              <div className="schedule-hour-heading">Horário</div>
              {days.map((day) => (
                <div
                  className="schedule-day-heading"
                  key={day}
                  data-today={day === localDay(new Date().toISOString())}
                  aria-current={
                    day === localDay(new Date().toISOString())
                      ? "date"
                      : undefined
                  }
                >
                  <strong>
                    {shortDay(day)}
                    {day === localDay(new Date().toISOString()) && (
                      <span className="schedule-today-label">Hoje</span>
                    )}
                  </strong>
                  <small>
                    {
                      appointments.filter(
                        (a) => localDay(a.scheduledAt) === day,
                      ).length
                    }{" "}
                    agendamentos
                  </small>
                </div>
              ))}
              {rows.map((minute) => (
                <ScheduleRow
                  key={minute}
                  minute={minute}
                  step={availability?.displayStep ?? 30}
                  days={days}
                  slots={slotSet}
                  appointments={appointments}
                  onBook={newBooking}
                  onOpen={(a) => {
                    setOpened(a);
                    setError("");
                  }}
                />
              ))}
            </div>
          </div>
          <small className="schedule-note">
            Intervalo visual: {availability?.displayStep ?? 30} minutos. Apenas
            os intervalos liberados na configuração ficam disponíveis. Dados
            desta sessão, sem sincronização com a agenda externa.
          </small>
        </>
      )}
      {!!unassigned.length && (
        <section className="team-note">
          <h2>Registros sem profissional vinculado</h2>
          <p>Estes registros não bloqueiam a agenda de um médico específico.</p>
          {unassigned.map((a) => (
            <Button
              key={a.id}
              variant="outline"
              size="sm"
              onClick={() => setOpened(a)}
            >
              {a.name} · {dateTime(a.scheduledAt)}
            </Button>
          ))}
        </section>
      )}
      <details>
        <summary>
          Registros do profissional nesta semana ({appointments.length})
        </summary>
        {appointments.length ? (
          appointments.map((a) => (
            <div className="schedule-record" key={a.id}>
              <span>
                <strong>{a.name}</strong>
                <small>
                  {dateTime(a.scheduledAt)} ·{" "}
                  {a.endsAt
                    ? `${(Date.parse(a.endsAt) - Date.parse(a.scheduledAt)) / 60000} min`
                    : "30 min de referência (registro anterior)"}
                </small>
              </span>
              <Button variant="outline" size="sm" onClick={() => setOpened(a)}>
                Ver agendamento
              </Button>
            </div>
          ))
        ) : (
          <p>Nenhum agendamento neste recorte.</p>
        )}
      </details>
      {booking && (
        <ScheduleDialog
          title="Criar agendamento"
          onClose={() => {
            setBooking(null);
            setError("");
          }}
        >
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveBooking();
            }}
          >
            <p>
              Profissional:{" "}
              <strong>
                {client.doctors.find((d) => d.id === booking.doctorId)?.name}
              </strong>
            </p>
            <label>
              Lead
              <select
                value={booking.leadId}
                onChange={(e) =>
                  setBooking({ ...booking, leadId: e.target.value })
                }
              >
                <option value="">Selecione um lead deste cliente</option>
                {repositories.leads.list(clientId).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-columns">
              <label>
                Data
                <input
                  type="date"
                  value={booking.day}
                  onChange={(e) =>
                    setBooking({ ...booking, day: e.target.value })
                  }
                />
              </label>
              <label>
                Horário
                <input
                  type="time"
                  step={60}
                  value={booking.time}
                  onChange={(e) =>
                    setBooking({ ...booking, time: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Duração em minutos
              <input
                type="number"
                min={1}
                max={480}
                step={1}
                value={booking.duration}
                onChange={(e) =>
                  setBooking({ ...booking, duration: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Observações
              <textarea
                maxLength={1000}
                value={booking.notes}
                onChange={(e) =>
                  setBooking({ ...booking, notes: e.target.value })
                }
              />
            </label>
            <small>
              O lead pode estar vinculado a outro profissional; este agendamento
              mantém seu próprio vínculo com o médico selecionado.
            </small>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <Button type="submit">Salvar agendamento</Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setBooking(null);
                  setError("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </ScheduleDialog>
      )}
      {opened && (
        <ScheduleDialog
          title="Detalhes do agendamento"
          onClose={() => setOpened(null)}
        >
          <h3>{opened.name}</h3>
          <p>
            {dateTime(opened.scheduledAt)} até {dateTime(endsAt(opened))}
          </p>
          <p>
            {client.doctors.find((d) => d.id === schedule.doctorId(opened))
              ?.name ?? "Sem profissional vinculado"}
          </p>
          {!opened.endsAt && (
            <small>
              Duração de referência de 30 minutos para registro anterior sem
              término informado.
            </small>
          )}
          <p className="preserve-lines">{opened.notes}</p>
          <Badge>
            {opened.attendance === "present"
              ? "Compareceu"
              : opened.attendance === "absent"
                ? "Não compareceu"
                : "Comparecimento não informado"}
          </Badge>
          <div className="actions">
            <Button
              variant="outline"
              onClick={() => attendance(opened, "present")}
            >
              Compareceu
            </Button>
            <Button
              variant="outline"
              onClick={() => attendance(opened, "absent")}
            >
              Não compareceu
            </Button>
            <Button
              variant="ghost"
              onClick={() => attendance(opened, "unknown")}
            >
              Confirmar depois
            </Button>
          </div>
        </ScheduleDialog>
      )}
    </>
  );
}
function ScheduleRow({
  minute,
  step,
  days,
  slots,
  appointments,
  onBook,
  onOpen,
}: {
  minute: number;
  step: number;
  days: string[];
  slots: Set<string>;
  appointments: AppointmentMirror[];
  onBook: (day: string, time: string) => void;
  onOpen: (a: AppointmentMirror) => void;
}) {
  return (
    <>
      <div className="schedule-hour">{timeLabel(minute)}</div>
      {days.map((day) => {
        const time = timeLabel(minute),
          start = Date.parse(`${day}T${time}:00-03:00`),
          booked = appointments.filter((a) =>
            overlaps(
              start,
              start + step * 60000,
              Date.parse(a.scheduledAt),
              Date.parse(endsAt(a)),
            ),
          ),
          free = slots.has(`${day}T${time}`);
        if (booked.length)
          return (
            <div
              className="schedule-cell"
              key={day}
              data-today={day === localDay(new Date().toISOString())}
            >
              {booked.map((a) => (
                <button
                  key={a.id}
                  className="schedule-slot"
                  data-state="booked"
                  aria-label={`${shortDay(day)} ${time} Agendado: ${a.name}`}
                  onClick={() => onOpen(a)}
                >
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(a.scheduledAt))}
                  </span>
                  <small>
                    {a.name}
                    {Date.parse(a.scheduledAt) < start ? " · continuação" : ""}
                  </small>
                </button>
              ))}
            </div>
          );
        return (
          <button
            key={day}
            className="schedule-slot"
            data-today={day === localDay(new Date().toISOString())}
            data-state={free ? "free" : "blocked"}
            disabled={!free}
            aria-label={`${shortDay(day)} ${time} ${free ? "Disponível" : "Indisponível"}`}
            onClick={() => onBook(day, time)}
          >
            <span>{time}</span>
            <small>{free ? "Disponível" : "Indisponível"}</small>
          </button>
        );
      })}
    </>
  );
}
export function ScheduleDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.showModal();
    const node = ref.current;
    return () => {
      node?.close();
      queueMicrotask(() => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="schedule-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="section-caption">
        <h2>{title}</h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Fechar janela"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
