import { z } from "zod";
export const CalendarSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    holidays: z.array(z.iso.date()),
    timezone: z.string().default("America/Sao_Paulo"),
    exceptions: z.record(z.string(), z.object({ start: z.string().nullable(), end: z.string().nullable() })).default({}),
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
const localParts = (ms: number, timezone: string) =>
  Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(ms).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
const localDate = (ms: number, timezone: string) => {
  const parts = localParts(ms, timezone) as { year: string; month: string; day: string };
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const zonedMidnight = (date: string, timezone: string) => {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const formatted = localParts(guess, timezone) as { hour?: string; minute?: string; second?: string };
  const offset = (Number(formatted.hour ?? 0) * 3600 + Number(formatted.minute ?? 0) * 60 + Number(formatted.second ?? 0)) * 1000;
  return guess - offset;
};
export function businessMs(from: string, to: string, calendar: BusinessCalendar) {
  const begin = Date.parse(from), finish = Date.parse(to);
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin) return 0;
  const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  let date = localDate(begin, calendar.timezone), total = 0;
  for (let index = 0; index < 370 && zonedMidnight(date, calendar.timezone) < finish; index += 1) {
    const noon = zonedMidnight(date, calendar.timezone) + 12 * 60 * 60000;
    const weekday = new Date(noon).getUTCDay();
    const exception = calendar.exceptions[date];
    const isHoliday = calendar.holidays.includes(date) || exception?.start === null;
    if (!isHoliday && (exception || calendar.days.includes(weekday))) {
      const start = exception?.start ?? calendar.start;
      const end = exception?.end ?? calendar.end;
      const windowStart = zonedMidnight(date, calendar.timezone) + minutes(start) * 60000;
      const windowEnd = zonedMidnight(date, calendar.timezone) + minutes(end) * 60000;
      total += Math.max(0, Math.min(finish, windowEnd) - Math.max(begin, windowStart));
    }
    const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return total;
}
export function inBusinessTime(now: number, c: BusinessCalendar) {
  return (
    businessMs(
      new Date(now).toISOString(),
      new Date(now + 1000).toISOString(),
      c,
    ) > 0
  );
}
export function claimSla(createdAt: string, now: number, c: BusinessCalendar) {
  const elapsedMs = businessMs(createdAt, new Date(now).toISOString(), c);
  return {
    elapsedMs,
    remainingMs: Math.max(0, 600000 - elapsedMs),
    overdue: elapsedMs > 600000,
  };
}
export function clock(ms: number) {
  const sec = Math.floor(Math.abs(ms) / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
