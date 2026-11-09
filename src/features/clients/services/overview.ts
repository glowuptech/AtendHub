import { z } from "zod";
import type { Client } from "@/domain/schemas";
import type { RepositoryRegistry } from "@/domain/contracts";
import { uid } from "@/lib/mocks/fixtures";
export const DEMO_TODAY = "2026-11-03";
const dayMs = 86400000;
export const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / dayMs,
  );
export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + offset * dayMs)
    .toISOString()
    .slice(0, 10);
}
export const RangeSchema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine(
    (v) => v.from <= v.to,
    "A data inicial deve ser anterior ou igual à final.",
  )
  .refine(
    (v) => daysBetween(v.from, v.to) < 366,
    "Selecione um período de até 366 dias.",
  );
export function localDay(timestamp: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
export function partnershipSummary(
  p: Client["partnership"],
  today = DEMO_TODAY,
) {
  return {
    projectDays: p.projectStartedOn
      ? daysBetween(p.projectStartedOn, today)
      : null,
    contractDays: p.signedOn ? daysBetween(p.signedOn, today) : null,
    signatureDays:
      !p.signedOn && p.signatureDueOn
        ? daysBetween(today, p.signatureDueOn)
        : null,
    renewalDays: p.renewsOn ? daysBetween(today, p.renewsOn) : null,
  };
}
export const ratio = (n: number, d: number) =>
  d ? `${Math.round((n / d) * 100)}%` : "N/D";
function scopedList<T>(list: () => T[]): T[] {
  try {
    return list();
  } catch (error) {
    if (error instanceof Error && error.message.includes("fora do escopo")) return [];
    throw error;
  }
}

export function getClientOverview(
  repositories: RepositoryRegistry,
  clientId: string,
  range: { from: string; to: string },
  doctorId = "all",
  clientOverride?: Client,
) {
  RangeSchema.parse(range);
  let client = clientOverride;
  if (!client) client = repositories.clients.get(clientId);
  if (!client) throw new Error("Cliente não encontrado.");
  if (
    doctorId !== "all" &&
    doctorId !== "unassigned" &&
    !client.doctors.some((d) => d.id === doctorId)
  )
    throw Error("Profissional fora desta clínica");
  const doctorMatch = (id: string | null) =>
    doctorId === "all" || (doctorId === "unassigned" ? !id : id === doctorId);
  const inRange = (day: string) => day >= range.from && day <= range.to;
  const allLeads = scopedList(() => repositories.leads.list(clientId)),
    leads = allLeads.filter(
      (l) => doctorMatch(l.doctorId) && inRange(localDay(l.createdAt)),
    );
  const mirrors = scopedList(() => repositories.appointments.list(clientId));
  const allIds = new Set(
    allLeads.filter((l) => doctorMatch(l.doctorId)).map((l) => l.id),
  );
  const appointments = mirrors.filter(
    (a) => allIds.has(a.leadId) && inRange(localDay(a.scheduledAt)),
  );
  const converted = leads.filter((l) =>
    mirrors.some((a) => a.leadId === l.id),
  ).length;
  const responseSamples = leads
    .filter(
      (l) =>
        l.firstResponseAt &&
        Date.parse(l.firstResponseAt) >= Date.parse(l.createdAt),
    )
    .map(
      (l) => (Date.parse(l.firstResponseAt!) - Date.parse(l.createdAt)) / 60000,
    );
  const handlingSamples = leads.flatMap((l) =>
    l.handlingMinutes === null ? [] : [l.handlingMinutes],
  );
  // Fixed anonymous demo aggregates, not generated leads or a production analytics API.
  const formRows = scopedList(() => repositories.forms.list(clientId))
    .filter((f) => doctorMatch(f.doctorId))
    .map((f) => {
      const seeded = [uid(300), uid(400), uid(500)].includes(f.id);
      const daily = ["2026-11-01", "2026-11-02", "2026-11-03"]
        .filter(inRange)
        .map((day) => {
          const i = Number(day.slice(-2)) - 1;
          return {
            day,
            views: seeded ? [25, 35, 40][i] : 0,
            submitted: seeded ? [8, 13, 17][i] : 0,
          };
        });
      return {
        id: f.id,
        name: f.name,
        version: "v1",
        views: daily.reduce((s, d) => s + d.views, 0),
        submitted: daily.reduce((s, d) => s + d.submitted, 0),
        daily,
      };
    });
  const daily = Array.from(
    { length: daysBetween(range.from, range.to) + 1 },
    (_, i) => {
      const day = shiftDay(range.from, i);
      return {
        day,
        leads: leads.filter((l) => localDay(l.createdAt) === day).length,
        appointments: appointments.filter(
          (a) => localDay(a.scheduledAt) === day,
        ).length,
      };
    },
  );
  return {
    leads,
    appointments,
    converted,
    views: formRows.reduce((s, f) => s + f.views, 0),
    submitted: formRows.reduce((s, f) => s + f.submitted, 0),
    forms: formRows,
    daily,
    responded: responseSamples.length,
    responseAverage: responseSamples.length
      ? responseSamples.reduce((s, n) => s + n, 0) / responseSamples.length
      : null,
    handlingCount: handlingSamples.length,
    handlingAverage: handlingSamples.length
      ? handlingSamples.reduce((s, n) => s + n, 0) / handlingSamples.length
      : null,
  };
}
