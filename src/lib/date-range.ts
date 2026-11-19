import { z } from "zod";
const dayMs = 86400000;
export const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / dayMs,
  );
export const shiftDay = (day: string, offset: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + offset * dayMs)
    .toISOString()
    .slice(0, 10);
export const RangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    (v) => v.from <= v.to,
    "A data inicial deve ser anterior ou igual à final.",
  )
  .refine(
    (v) => daysBetween(v.from, v.to) < 366,
    "Selecione um período de até 366 dias.",
  );
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const localDay = (timestamp: string) =>
  dayFormatter.format(new Date(timestamp));
