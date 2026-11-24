"use client";
import { ConfirmationsList } from "./eve-confirmations";
import { BookingDetailsFields } from "./booking-details";
import {
  prepareBookingDetails,
  validationMessage,
  type BookingDetailsDraft,
} from "@/features/leads/registration/model";
import { LeadPicker } from "./lead-picker";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Badge,
  Empty,
  dateTime,
  LoadingState,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { localDay, shiftDay } from "@/features/clients/services/overview";
import { useLeads } from "@/features/leads/hooks";
import {
  weekDays,
  monday,
  timeLabel,
  overlaps,
  minutes,
  type Availability,
  type Booking,
} from "../services/schedule";
import { intervalsToSlots, slotsToIntervals } from "../services/intervals";
import {
  changeAppointment,
  createAppointment,
  saveAvailability,
  useAgenda,
  type AgendaAppointment,
  type AppointmentChange,
} from "../hooks";
import { AvailabilityEditor, shortDay } from "./availability";
import type { BookingLead } from "../services/lead-search";

const subscribe = () => () => {};
const brazilMinutes = (iso: string) => {
  const local = new Date(Date.parse(iso) - 3 * 3600000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
const message = (e: unknown, fallback = "Confira os campos.") =>
  validationMessage(e, fallback);
const durationOf = (a: AgendaAppointment) =>
  Math.round((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60000);

export function WeeklyAppointments() {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { clientId, authorizedClients } = useDemo();
  const client = authorizedClients.find((item) => item.id === clientId);

  if (!ready || !clientId || !client) {
    return <LoadingState label="Carregando agenda…" />;
  }
  return (
    <WeeklyWorkspace
      key={clientId}
      clientId={clientId}
      clientName={client.name}
      doctors={client.doctors}
    />
  );
}

export function WeeklyWorkspace({
  clientId,
  clientName,
  doctors,
  initialLeadId,
  conversationId,
  bookingPreview,
}: {
  clientId: string;
  clientName: string;
  doctors: { id: string; name: string }[];
  initialLeadId?: string;
  conversationId?: string;
  bookingPreview?: ReactNode;
}) {
  const [doctor, setDoctor] = useState(doctors[0]?.id ?? ""),
    [week, setWeek] = useState(() =>
      monday(localDay(new Date().toISOString())),
    ),
    [config, setConfig] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<BookingDetailsDraft>({});
  const [bookingPane, setBookingPane] = useState<"form" | "conversation">(
    "form",
  );
  const [booking, setBooking] = useState<Booking | null>(null),
    [openedId, setOpenedId] = useState<string | null>(null),
    [reschedule, setReschedule] = useState<{
      day: string;
      time: string;
      duration: number;
    } | null>(null);
  const agenda = useAgenda(clientId, doctor || null, week);
  const { data, error: loadError, isLoading, mutate } = agenda;
  const leadsQuery = useLeads({ clientId: booking ? clientId : null });
  const days = weekDays(week);
  const today = localDay(new Date().toISOString());
  const appointments = useMemo(() => data?.appointments ?? [], [data]);
  const opened = appointments.find((a) => a.id === openedId) ?? null;
  const availability = useMemo<Availability | null>(
    () =>
      data && doctor
        ? {
            doctorId: doctor,
            week,
            slots: intervalsToSlots(data.intervals),
            defaultDuration: data.settings.defaultDuration,
            displayStep: data.settings.displayStep,
          }
        : null,
    [data, doctor, week],
  );
  const bookingLeads = useMemo<BookingLead[]>(
    () =>
      (leadsQuery.data ?? []).map((lead) => ({
        id: lead.id,
        clientId,
        name: lead.name,
        createdAt: lead.created_at,
        contact: { phone: lead.phone, email: lead.email },
      })),
    [leadsQuery.data, clientId],
  );
  const bookedRefs = useMemo(
    () => (data?.bookedLeadIds ?? []).map((leadId) => ({ clientId, leadId })),
    [data, clientId],
  );
  const slotSet = new Set(availability?.slots ?? []);
  const step = availability?.displayStep ?? 30;
  const rawMinutes = [
    ...(availability?.slots ?? []).map((s) => minutes(s.slice(11))),
    ...appointments.map((a) => brazilMinutes(a.startsAt)),
  ];
  const from = Math.min(480, ...rawMinutes),
    to = Math.min(
      1440,
      Math.max(
        1080,
        ...rawMinutes.map((n) => n + 60),
        ...appointments.map((a) => brazilMinutes(a.endsAt) || 1440),
      ),
    );
  const rows = Array.from(
    { length: Math.ceil((to - from) / step) },
    (_, i) => from + i * step,
  );
  function newBooking(day = days[0], time = "08:00") {
    setError("");
    setBookingDetails({});
    setBookingPane("form");
    setBooking({
      id: crypto.randomUUID(),
      doctorId: doctor,
      leadId: initialLeadId ?? "",
      day,
      time,
      duration: availability?.defaultDuration ?? 30,
      notes: "",
    });
  }
  async function saveBooking() {
    if (!booking || busy) return;
    if (!booking.leadId) return setError("Selecione um lead para agendar.");
    setBusy(true);
    try {
      const details = {
        ...prepareBookingDetails(bookingDetails),
        ...(conversationId &&
        booking.leadId === initialLeadId &&
        data?.capabilities?.bookingDetails
          ? { conversationId }
          : {}),
      };
      if (Object.keys(details).length && !data?.capabilities?.bookingDetails)
        throw new Error(
          "Os campos adicionais ainda não foram ativados no servidor.",
        );
      const saved = await createAppointment(clientId, booking.id, {
        ...details,
        professionalId: booking.doctorId,
        leadId: booking.leadId,
        day: booking.day,
        time: booking.time,
        duration: booking.duration,
        notes: booking.notes,
      });
      if (Object.keys(details).length && saved.bookingDetailsSaved !== true)
        throw new Error(
          "O servidor não confirmou os dados adicionais. Confira a agenda antes de tentar novamente.",
        );
      await mutate();
      setBooking(null);
      setError("");
      setNotice("Agendamento salvo.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function change(
    a: AgendaAppointment,
    body: AppointmentChange,
    done: string,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      await changeAppointment(a.id, body);
      await mutate();
      setError("");
      setReschedule(null);
      if (body.action === "status" && body.status === "cancelled")
        setOpenedId(null);
      setNotice(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveConfig(value: Availability) {
    try {
      await saveAvailability(clientId, {
        professionalId: doctor,
        week,
        defaultDuration: value.defaultDuration,
        displayStep: value.displayStep,
        intervals: slotsToIntervals(value.slots),
      });
      await mutate();
      setConfig(false);
      setNotice("Disponibilidade salva para esta semana.");
      setError("");
    } catch (e) {
      setError(message(e, "Confira os horários."));
    }
  }
  return (
    <>
      <Heading
        title="Agendamentos"
        eyebrow="WORKSPACE"
        description={`${clientName} · agenda por profissional · America/Sao_Paulo`}
        action={
          <Button
            disabled={!doctor || !availability}
            onClick={() => newBooking()}
          >
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
            {!doctors.length && (
              <option value="">Nenhum profissional cadastrado</option>
            )}
            {doctors.map((d) => (
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
              setWeek(monday(today));
              setConfig(false);
            }}
          >
            Esta semana
          </Button>
        </div>
        <Button
          variant="outline"
          disabled={!doctor || !availability || !data?.canManageAvailability}
          title={
            data && !data.canManageAvailability
              ? "Seu perfil não pode configurar a disponibilidade."
              : undefined
          }
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
          onSave={saveConfig}
        />
      )}
      {error && !booking && !opened && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {loadError && (
        <p role="alert" className="field-error">
          {message(loadError, "Não foi possível carregar a agenda.")}
        </p>
      )}
      {!doctor ? (
        <Empty
          title="Cadastre um profissional para configurar a agenda"
          description="Adicione os profissionais nas informações do cliente."
        />
      ) : isLoading || !availability ? (
        loadError ? null : (
          <LoadingState label="Carregando agenda…" />
        )
      ) : (
        <>
          <div
            className="schedule-board"
            tabIndex={0}
            aria-label="Agenda semanal do profissional"
          >
            <div
              className="schedule-grid"
              data-has-today={days.includes(today)}
              style={
                {
                  "--today-index": days.indexOf(today),
                } as React.CSSProperties
              }
            >
              <div className="schedule-hour-heading">Horário</div>
              {days.map((day) => (
                <div
                  className="schedule-day-heading"
                  key={day}
                  data-today={day === today}
                  aria-current={day === today ? "date" : undefined}
                >
                  <strong>
                    {shortDay(day)}
                    {day === today && (
                      <span className="schedule-today-label">Hoje</span>
                    )}
                  </strong>
                  <small>
                    {
                      appointments.filter((a) => localDay(a.startsAt) === day)
                        .length
                    }{" "}
                    agendamentos
                  </small>
                </div>
              ))}
              {rows.map((minute) => (
                <ScheduleRow
                  key={minute}
                  minute={minute}
                  step={step}
                  days={days}
                  today={today}
                  slots={slotSet}
                  appointments={appointments}
                  onBook={newBooking}
                  onOpen={(a) => {
                    setOpenedId(a.id);
                    setReschedule(null);
                    setError("");
                  }}
                />
              ))}
            </div>
          </div>
          <small className="schedule-note">
            Intervalo visual: {step} minutos. Apenas os intervalos liberados na
            configuração ficam disponíveis. Horários em America/Sao_Paulo.
          </small>
        </>
      )}
      <details>
        <summary>
          Registros do profissional nesta semana ({appointments.length})
        </summary>
        {appointments.length ? (
          appointments.map((a) => (
            <div className="schedule-record" key={a.id}>
              <span>
                <strong>{a.leadName}</strong>
                <small>
                  {dateTime(a.startsAt)} · {durationOf(a)} min
                </small>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpenedId(a.id);
                  setReschedule(null);
                }}
              >
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
          className={bookingPreview ? "schedule-booking-dialog" : undefined}
          onClose={() => {
            setBooking(null);
            setError("");
          }}
        >
          <div
            className={bookingPreview ? "schedule-booking-layout" : undefined}
            data-pane={bookingPreview ? bookingPane : undefined}
          >
            {bookingPreview && (
              <div
                className="schedule-booking-switch"
                role="group"
                aria-label="Visualização do agendamento"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={bookingPane === "form" ? "default" : "outline"}
                  aria-pressed={bookingPane === "form"}
                  onClick={() => setBookingPane("form")}
                >
                  Agendamento
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    bookingPane === "conversation" ? "default" : "outline"
                  }
                  aria-pressed={bookingPane === "conversation"}
                  onClick={() => setBookingPane("conversation")}
                >
                  Conversa
                </Button>
              </div>
            )}
            <form
              className={bookingPreview ? "schedule-booking-form" : undefined}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void saveBooking();
              }}
            >
              <p>
                Profissional:{" "}
                <strong>
                  {doctors.find((d) => d.id === booking.doctorId)?.name}
                </strong>
              </p>
              <LeadPicker
                clientId={clientId}
                leads={bookingLeads}
                appointments={bookedRefs}
                value={booking.leadId}
                onChange={(leadId) => {
                  setBooking({ ...booking, leadId });
                  setBookingDetails({});
                }}
              />
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
              <BookingDetailsFields
                key={booking.id + booking.leadId}
                leadId={booking.leadId}
                enabled={data?.capabilities?.bookingDetails === true}
                value={bookingDetails}
                onChange={setBookingDetails}
              />
              <small>
                O lead pode estar vinculado a outro profissional; este
                agendamento mantém seu próprio vínculo com o médico selecionado.
              </small>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions">
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar agendamento"}
                </Button>
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
            {bookingPreview && (
              <div className="schedule-booking-reference">
                {booking.leadId === initialLeadId ? (
                  bookingPreview
                ) : (
                  <p className="schedule-booking-reference-empty muted">
                    Selecione o lead desta conversa para consultar o histórico
                    aqui.
                  </p>
                )}
              </div>
            )}
          </div>
        </ScheduleDialog>
      )}
      {opened && (
        <ScheduleDialog
          title="Detalhes do agendamento"
          onClose={() => {
            setOpenedId(null);
            setReschedule(null);
            setError("");
          }}
        >
          <h3>{opened.leadName}</h3>
          <p>
            {dateTime(opened.startsAt)} até {dateTime(opened.endsAt)}
          </p>
          <p>
            {doctors.find((d) => d.id === opened.professionalId)?.name ??
              "Sem profissional vinculado"}
          </p>
          <ConfirmationsList clientId={clientId} appointmentId={opened.id} onChange={()=>mutate()}/>
          {opened.notes && <p className="preserve-lines">{opened.notes}</p>}
          {opened.service && (
            <p>
              Serviço: {opened.service.description} · Valor previsto:{" "}
              {opened.service.amountCents == null
                ? "Não informado"
                : new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(opened.service.amountCents / 100)}
            </p>
          )}
          <div className="actions">
            <Badge>
              {opened.status === "confirmed"
                ? "Confirmado"
                : opened.status === "rescheduling"
                  ? "Em remarcação"
                  : "Aguardando confirmação"}
            </Badge>
            <Badge>
              {opened.attendance === "present"
                ? "Compareceu"
                : opened.attendance === "absent"
                  ? "Não compareceu"
                  : "Comparecimento não informado"}
            </Badge>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                change(
                  opened,
                  { action: "attendance", attendance: "present" },
                  "Comparecimento atualizado.",
                )
              }
            >
              Compareceu
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                change(
                  opened,
                  { action: "attendance", attendance: "absent" },
                  "Comparecimento atualizado.",
                )
              }
            >
              Não compareceu
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                change(
                  opened,
                  { action: "attendance", attendance: "unknown" },
                  "Comparecimento atualizado.",
                )
              }
            >
              Confirmar depois
            </Button>
          </div>
          <div className="actions">
            {opened.status !== "confirmed" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  change(
                    opened,
                    { action: "status", status: "confirmed" },
                    "Agendamento confirmado.",
                  )
                }
              >
                Confirmar administrativamente
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setReschedule(
                  reschedule
                    ? null
                    : {
                        day: localDay(opened.startsAt),
                        time: timeLabel(brazilMinutes(opened.startsAt)),
                        duration: durationOf(opened),
                      },
                )
              }
            >
              Remarcar
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cancelar este agendamento?"))
                  void change(
                    opened,
                    { action: "status", status: "cancelled" },
                    "Agendamento cancelado.",
                  );
              }}
            >
              Cancelar agendamento
            </Button>
          </div>
          {reschedule && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  opened,
                  { action: "reschedule", ...reschedule },
                  "Agendamento remarcado.",
                );
              }}
            >
              <div className="form-columns">
                <label>
                  Nova data
                  <input
                    type="date"
                    value={reschedule.day}
                    onChange={(e) =>
                      setReschedule({ ...reschedule, day: e.target.value })
                    }
                  />
                </label>
                <label>
                  Novo horário
                  <input
                    type="time"
                    step={60}
                    value={reschedule.time}
                    onChange={(e) =>
                      setReschedule({ ...reschedule, time: e.target.value })
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
                  value={reschedule.duration}
                  onChange={(e) =>
                    setReschedule({
                      ...reschedule,
                      duration: Number(e.target.value),
                    })
                  }
                />
              </label>
              <div className="actions">
                <Button type="submit" disabled={busy}>
                  Salvar nova data
                </Button>
              </div>
            </form>
          )}
        </ScheduleDialog>
      )}
    </>
  );
}
function ScheduleRow({
  minute,
  step,
  days,
  today,
  slots,
  appointments,
  onBook,
  onOpen,
}: {
  minute: number;
  step: number;
  days: string[];
  today: string;
  slots: Set<string>;
  appointments: AgendaAppointment[];
  onBook: (day: string, time: string) => void;
  onOpen: (a: AgendaAppointment) => void;
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
              Date.parse(a.startsAt),
              Date.parse(a.endsAt),
            ),
          ),
          free = slots.has(`${day}T${time}`);
        if (booked.length)
          return (
            <div className="schedule-cell" key={day} data-today={day === today}>
              {booked.map((a) => (
                <button
                  key={a.id}
                  className="schedule-slot"
                  data-state="booked"
                  aria-label={`${shortDay(day)} ${time} Agendado: ${a.leadName}`}
                  onClick={() => onOpen(a)}
                >
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(a.startsAt))}
                  </span>
                  <small>
                    {a.leadName}
                    {Date.parse(a.startsAt) < start ? " · continuação" : ""}
                  </small>
                </button>
              ))}
            </div>
          );
        return (
          <button
            key={day}
            className="schedule-slot"
            data-today={day === today}
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
  wide = false,
  className,
}: {
  wide?: boolean;
  className?: string;
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
      className={["schedule-dialog", wide && "schedule-dialog-wide", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
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
