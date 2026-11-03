import { z } from "zod";
export const CalendarSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    holidays: z.array(z.iso.date()),
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
};
const localDate = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
// Modern São Paulo operation uses UTC-03 (no daylight saving since 2019).
export function businessMs(
  from: string,
  to: string,
  calendar: BusinessCalendar,
) {
  const begin = Date.parse(from),
    finish = Date.parse(to);
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin)
    return 0;
  let day = Date.parse(localDate(begin) + "T00:00:00-03:00"),
    total = 0;
  const minutes = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  while (day < finish) {
    const date = localDate(day),
      weekday = new Date(day).getUTCDay();
    if (calendar.days.includes(weekday) && !calendar.holidays.includes(date))
      total += Math.max(
        0,
        Math.min(finish, day + minutes(calendar.end) * 60000) -
          Math.max(begin, day + minutes(calendar.start) * 60000),
      );
    day += 86400000;
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
