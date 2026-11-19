import { z } from "zod";

export const CLAIM_TARGET_MINUTES = 10;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const validTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
export const CalendarSchema = z
  .object({
    start: time,
    end: time,
    days: z.array(z.number().int().min(0).max(6)).min(1),
    holidays: z.array(z.iso.date()),
    timezone: z
      .string()
      .refine(validTimezone, "Informe um fuso horário válido.")
      .default("America/Sao_Paulo"),
    exceptions: z
      .record(
        z.iso.date(),
        z
          .object({ start: time.nullable(), end: time.nullable() })
          .refine(
            (v) =>
              (v.start === null && v.end === null) ||
              (v.start !== null && v.end !== null && v.end > v.start),
            "Informe um intervalo válido ou marque os dois horários como fechados.",
          ),
      )
      .default({}),
  })
  .refine(
    (v) => v.end > v.start,
    "O fim do expediente deve ser posterior ao início.",
  );
export type BusinessCalendar = z.infer<typeof CalendarSchema>;
export const defaultCalendar: BusinessCalendar = {
  start: "09:00",
  end: "17:00",
  days: [1, 2, 3, 4, 5],
  holidays: [],
  timezone: "America/Sao_Paulo",
  exceptions: {},
};
// Supabase TIME columns can arrive with seconds; the editor works with HH:mm.
const storedTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/)
  .transform((v) => v.slice(0, 5));
export const PersistedCalendarSchema = z
  .object({
    timezone: z.string(),
    weekdays: z.array(z.number()),
    workStart: storedTime,
    workEnd: storedTime,
    holidays: z.array(z.iso.date()).default([]),
    exceptions: z
      .record(
        z.string(),
        z.object({ start: storedTime.nullable(), end: storedTime.nullable() }),
      )
      .default({}),
  })
  .transform((v): z.input<typeof CalendarSchema> => ({
    start: v.workStart,
    end: v.workEnd,
    days: v.weekdays,
    holidays: v.holidays,
    timezone: v.timezone,
    exceptions: v.exceptions,
  }))
  .pipe(CalendarSchema);

const formatters = new Map<string, Intl.DateTimeFormat>();
const localParts = (ms: number, timezone: string) => {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timezone, formatter);
  }
  return Object.fromEntries(
    formatter
      .formatToParts(ms)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
};
const localDate = (ms: number, timezone: string) => {
  const parts = localParts(ms, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const zonedTime = (date: string, time: string, timezone: string) => {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, timezone);
    const delta =
      target -
      Date.parse(
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
      );
    guess += delta;
    if (!delta) break;
  }
  return guess;
};
export function businessMs(
  from: string,
  to: string,
  calendar: BusinessCalendar,
) {
  const begin = Date.parse(from),
    finish = Date.parse(to);
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin)
    return 0;
  let date = localDate(begin, calendar.timezone),
    total = 0;
  const lastDate = localDate(finish, calendar.timezone);
  for (; date <= lastDate;) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const exception = calendar.exceptions[date];
    const isHoliday =
      calendar.holidays.includes(date) || exception?.start === null;
    if (!isHoliday && (exception || calendar.days.includes(weekday))) {
      const start = exception?.start ?? calendar.start;
      const end = exception?.end ?? calendar.end;
      const windowStart = zonedTime(date, start, calendar.timezone);
      const windowEnd = zonedTime(date, end, calendar.timezone);
      total += Math.max(
        0,
        Math.min(finish, windowEnd) - Math.max(begin, windowStart),
      );
    }
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return total;
}
export function inBusinessTime(now: number, c: BusinessCalendar) {
  return (
    businessMs(
      new Date(now).toISOString(),
      new Date(now + 1).toISOString(),
      c,
    ) > 0
  );
}
export function claimSla(createdAt: string, now: number, c: BusinessCalendar) {
  const elapsedMs = businessMs(createdAt, new Date(now).toISOString(), c);
  const targetMs = CLAIM_TARGET_MINUTES * 60000;
  return {
    elapsedMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    overdue: elapsedMs >= targetMs,
  };
}
export function clock(ms: number) {
  // Ceiling keeps the initial 10:00 for the first fraction of a second, then 09:59.
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
