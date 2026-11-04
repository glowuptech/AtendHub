import { z } from "zod";
import { AppointmentSchema, type AppointmentMirror } from "@/domain/schemas";
import type {
  ClientScope,
  ClientRepository,
  LeadRepository,
} from "@/domain/contracts";
import { localDay, shiftDay } from "@/features/clients/services/overview";
export const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function monday(day: string) {
  const n = new Date(day + "T12:00:00Z").getUTCDay();
  return shiftDay(day, -((n + 6) % 7));
}
export const weekDays = (week: string) =>
  Array.from({ length: 7 }, (_, i) => shiftDay(week, i));
const slotSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):(?:[0-5]\d)$/);
export const AvailabilitySchema = z
  .object({
    doctorId: z.string().uuid(),
    week: z.iso.date(),
    slots: z.array(slotSchema).max(10080),
    defaultDuration: z.number().int().min(1).max(480).default(30),
    displayStep: z.number().int().min(5).max(120).default(30),
  })
  .superRefine((v, ctx) => {
    if (monday(v.week) !== v.week)
      ctx.addIssue({
        code: "custom",
        message: "Selecione uma semana iniciada na segunda-feira.",
      });
    if (v.slots.some((s) => !weekDays(v.week).includes(s.slice(0, 10))))
      ctx.addIssue({
        code: "custom",
        message: "Os horários devem pertencer à semana selecionada.",
      });
  });
export type Availability = z.infer<typeof AvailabilitySchema>;
export function rangeSlots(day: string, start: string, end: string) {
  const from = minutes(start),
    to = end === "24:00" ? 1440 : minutes(end);
  if (
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(start) ||
    !/^(([01]\d|2[0-3]):([0-5]\d)|24:00)$/.test(end) ||
    from >= to
  )
    throw Error("Informe um intervalo válido, em minutos inteiros.");
  return Array.from(
    { length: to - from },
    (_, i) => `${day}T${timeLabel(from + i)}`,
  );
}
export const BookSchema = z.object({
  id: z.string().uuid(),
  doctorId: z.string().uuid(),
  leadId: z.string().uuid(),
  day: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):(?:[0-5]\d)$/),
  duration: z.number().int().min(1).max(480),
  notes: z.string().trim().max(1000).default(""),
});
export type Booking = z.infer<typeof BookSchema>;
export interface AppointmentEvent {
  id: string;
  eventType: "appointment.created";
  schemaVersion: 1;
  organizationId: string;
  clientId: string;
  leadId: string;
  doctorId: string;
  appointmentId: string;
  operation: "healthcare" | "legal";
  scheduledAt: string;
  endsAt: string;
  timezone: "America/Sao_Paulo";
  occurredAt: string;
  status: "pending";
}
export function endsAt(a: AppointmentMirror) {
  return (
    a.endsAt ?? new Date(Date.parse(a.scheduledAt) + 30 * 60000).toISOString()
  );
}
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && aEnd > bStart;
}
export class MemorySchedule {
  private availability = new Map<string, Availability>();
  private preferences = new Map<
    string,
    { defaultDuration: number; displayStep: number }
  >();
  private events: AppointmentEvent[] = [];
  constructor(
    private scope: ClientScope,
    private clients: ClientRepository,
    private leads: LeadRepository,
    private appointments: AppointmentMirror[],
  ) {}
  private client(id: string) {
    if (!this.scope.clientIds.includes(id))
      throw Error("Cliente fora do escopo.");
    return this.clients.get(id);
  }
  private doctor(clientId: string, doctorId: string) {
    const client = this.client(clientId);
    if (!client.doctors.some((d) => d.id === doctorId))
      throw Error("Profissional fora deste cliente.");
    return client;
  }
  doctorId(a: AppointmentMirror) {
    this.client(a.clientId);
    return a.doctorId ?? this.leads.get(a.clientId, a.leadId).doctorId;
  }
  get(clientId: string, doctorId: string, week: string): Availability {
    this.doctor(clientId, doctorId);
    return structuredClone(
      this.availability.get(`${clientId}:${doctorId}:${week}`) ?? {
        doctorId,
        week,
        slots: [],
        ...(this.preferences.get(`${clientId}:${doctorId}`) ?? {
          defaultDuration: 30,
          displayStep: 30,
        }),
      },
    );
  }
  save(clientId: string, raw: Availability) {
    const value = AvailabilitySchema.parse(raw);
    this.doctor(clientId, value.doctorId);
    this.preferences.set(`${clientId}:${value.doctorId}`, {
      defaultDuration: value.defaultDuration,
      displayStep: value.displayStep,
    });
    this.availability.set(`${clientId}:${value.doctorId}:${value.week}`, {
      ...value,
      slots: [...new Set(value.slots)].sort(),
    });
  }
  list(clientId: string) {
    this.client(clientId);
    return structuredClone(
      this.appointments.filter((a) => a.clientId === clientId),
    );
  }
  outbox(clientId: string) {
    this.client(clientId);
    return structuredClone(this.events.filter((e) => e.clientId === clientId));
  }
  book(clientId: string, raw: Booking) {
    const b = BookSchema.parse(raw),
      client = this.doctor(clientId, b.doctorId),
      lead = this.leads.get(clientId, b.leadId);
    const start = Date.parse(`${b.day}T${b.time}:00-03:00`),
      end = start + b.duration * 60000;
    if (localDay(new Date(end - 1).toISOString()) !== b.day)
      throw Error("A consulta deve terminar no mesmo dia.");
    const existing = this.appointments.find((a) => a.id === b.id);
    if (existing) {
      if (
        existing.clientId !== clientId ||
        existing.doctorId !== b.doctorId ||
        existing.leadId !== b.leadId ||
        Date.parse(existing.scheduledAt) !== start ||
        Date.parse(endsAt(existing)) !== end ||
        existing.notes !== b.notes
      )
        throw Error("Identificador de agendamento já utilizado.");
      return structuredClone(existing);
    }
    const available = new Set(
      this.get(clientId, b.doctorId, monday(b.day)).slots,
    );
    for (let t = minutes(b.time); t < minutes(b.time) + b.duration; t += 1)
      if (!available.has(`${b.day}T${timeLabel(t)}`))
        throw Error(
          "O intervalo completo precisa estar disponível para este profissional.",
        );
    if (
      this.appointments.some(
        (a) =>
          a.clientId === clientId &&
          this.doctorId(a) === b.doctorId &&
          overlaps(
            start,
            end,
            Date.parse(a.scheduledAt),
            Date.parse(endsAt(a)),
          ),
      )
    )
      throw Error("Este horário já está ocupado. Escolha outro intervalo.");
    const appointment = AppointmentSchema.parse({
      id: b.id,
      organizationId: client.organizationId,
      clientId,
      leadId: lead.id,
      name: lead.name,
      doctorId: b.doctorId,
      scheduledAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      notes: b.notes,
      source: "Registro manual",
      attendance: "unknown",
      status: "awaiting_confirmation",
    });
    const event: AppointmentEvent = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      eventType: "appointment.created",
      organizationId: client.organizationId,
      clientId,
      leadId: lead.id,
      doctorId: b.doctorId,
      appointmentId: appointment.id,
      operation: client.vertical,
      scheduledAt: appointment.scheduledAt,
      endsAt: appointment.endsAt!,
      timezone: "America/Sao_Paulo",
      occurredAt: new Date().toISOString(),
      status: "pending",
    };
    this.appointments.push(appointment);
    this.events.push(event);
    return structuredClone(appointment);
  }
}
