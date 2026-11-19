import { z } from "zod";
import { RangeSchema, localDay, daysBetween, shiftDay } from "@/lib/date-range";
export const DashboardFilterSchema = RangeSchema.and(
  z.object({
    vertical: z.enum(["all", "healthcare", "legal"]).default("all"),
    clientId: z.string().uuid().or(z.literal("")).default(""),
  }),
);
export type DashboardClient = {
  id: string;
  name: string;
  vertical: "healthcare" | "legal" | "unknown";
  status: string;
};
export type DashboardLead = {
  id: string;
  clientId: string;
  createdAt: string;
  stage: string;
  captureStatus: string;
  ownerId: string | null;
  firstResponseAt: string | null;
  claimedAt: string | null;
};
export type DashboardAppointment = {
  id: string;
  clientId: string;
  leadId: string;
  scheduledAt: string;
  status: string;
  attendance: string;
};
export const InvestmentInputSchema = z.object({
  clientId: z.string().uuid(),
  day: z.iso.date(),
  amountCents: z.number().int().min(0).max(100000000000),
  notes: z.string().trim().max(500).default(""),
});
export type DashboardInvestment = z.infer<typeof InvestmentInputSchema>;
export type DashboardDataset = {
  clients: DashboardClient[];
  leads: DashboardLead[];
  appointments: DashboardAppointment[];
  forms: { clientId: string; status: string }[];
  investments: DashboardInvestment[];
};
export function aggregateDashboard(
  input: DashboardDataset,
  range: { from: string; to: string },
  vertical = "all",
  clientId = "",
) {
  RangeSchema.parse(range);
  if (clientId && !input.clients.some((c) => c.id === clientId))
    throw new Error("Cliente fora do escopo.");
  const clients = input.clients.filter(
    (c) =>
      (vertical === "all" || c.vertical === vertical) &&
      (!clientId || c.id === clientId),
  );
  const dates = Array.from(
    { length: daysBetween(range.from, range.to) + 1 },
    (_, i) => shiftDay(range.from, i),
  );
  const within = (date: string) => date >= range.from && date <= range.to;
  const leadDays = new Map(
    input.leads.map((l) => [l.id, localDay(l.createdAt)]),
  );
  const appointmentDays = new Map(
    input.appointments.map((a) => [a.id, localDay(a.scheduledAt)]),
  );
  const rows = clients.map((client) => {
    const leads = input.leads.filter(
      (l) => l.clientId === client.id && within(leadDays.get(l.id)!),
    );
    const allAppointments = input.appointments.filter(
      (a) => a.clientId === client.id,
    );
    const liveAppointments = allAppointments.filter(
      (a) => a.status !== "cancelled",
    );
    const convertedIds = new Set(liveAppointments.map((a) => a.leadId));
    const converted = leads.filter((l) => convertedIds.has(l.id)).length;
    const appointments = liveAppointments.filter((a) =>
      within(appointmentDays.get(a.id)!),
    );
    const cancelled = allAppointments.filter(
      (a) => a.status === "cancelled" && within(appointmentDays.get(a.id)!),
    ).length;
    const investment = input.investments.filter(
      (i) => i.clientId === client.id && within(i.day),
    );
    const spent = investment.reduce((sum, i) => sum + i.amountCents, 0);
    const coverage = new Set(investment.map((i) => i.day)).size;
    const complete = coverage === dates.length;
    const responses = leads.flatMap((l) => {
      const ms = l.firstResponseAt
        ? Date.parse(l.firstResponseAt) - Date.parse(l.createdAt)
        : NaN;
      return Number.isFinite(ms) && ms >= 0 ? [ms / 60000] : [];
    });
    return {
      client,
      leads,
      converted,
      appointments,
      cancelled,
      investment,
      spent,
      coverage,
      complete,
      cpl: complete && leads.length ? spent / leads.length : null,
      cpa: complete && converted ? spent / converted : null,
      responses,
      forms: input.forms.filter(
        (f) => f.clientId === client.id && f.status !== "archived",
      ).length,
    };
  });
  const summarize = (group: typeof rows) => {
    const leads = group.flatMap((r) => r.leads),
      appointments = group.flatMap((r) => r.appointments),
      responses = group.flatMap((r) => r.responses);
    const spent = group.reduce((s, r) => s + r.spent, 0),
      converted = group.reduce((s, r) => s + r.converted, 0);
    const complete = group.length > 0 && group.every((r) => r.complete);
    return {
      clients: group.length,
      active: group.filter((r) => r.client.status === "active").length,
      leads: leads.length,
      completed: leads.filter((l) => l.captureStatus === "completed").length,
      incomplete: leads.filter((l) => l.captureStatus !== "completed").length,
      converted,
      conversion: leads.length ? (converted / leads.length) * 100 : null,
      spent,
      complete,
      coverage: group.reduce((s, r) => s + r.coverage, 0),
      expected: group.length * dates.length,
      cpl: complete && leads.length ? spent / leads.length : null,
      cpa: complete && converted ? spent / converted : null,
      appointments: appointments.length,
      cancelled: group.reduce((s, r) => s + r.cancelled, 0),
      present: appointments.filter((a) => a.attendance === "present").length,
      absent: appointments.filter((a) => a.attendance === "absent").length,
      pendingPresence: appointments.filter((a) => a.attendance === "unknown")
        .length,
      unassigned: leads.filter((l) => !l.ownerId).length,
      // No historical SLA snapshot is available in the current lead DTO. Never
      // recalculate historical claims using today's business calendar.
      lateClaims: leads.some((l) => l.claimedAt || l.ownerId) ? null : 0,
      response: responses.length
        ? responses.reduce((a, b) => a + b, 0) / responses.length
        : null,
      responseSamples: responses.length,
      forms: group.reduce((s, r) => s + r.forms, 0),
    };
  };
  const series = new Map<
    string,
    { leads: number; spent: number; coverage: number }
  >();
  for (const row of rows) {
    if (row.client.vertical === "unknown") continue;
    const value = (day: string) => {
      const key = `${row.client.vertical}:${day}`;
      if (!series.has(key))
        series.set(key, { leads: 0, spent: 0, coverage: 0 });
      return series.get(key)!;
    };
    for (const lead of row.leads) value(leadDays.get(lead.id)!).leads++;
    for (const investment of row.investment) {
      const entry = value(investment.day);
      entry.spent += investment.amountCents;
      entry.coverage++;
    }
  }
  const dailyValue = (vertical: "healthcare" | "legal", day: string) => ({
    ...(series.get(`${vertical}:${day}`) ?? {
      leads: 0,
      spent: 0,
      coverage: 0,
    }),
    expected: rows.filter((r) => r.client.vertical === vertical).length,
  });
  return {
    rows: rows.map(
      ({
        client,
        leads,
        converted,
        investment,
        spent,
        coverage,
        complete,
        cpl,
        cpa,
      }) => ({
        client,
        leads: leads.length,
        converted,
        investment,
        spent,
        coverage,
        complete,
        cpl,
        cpa,
      }),
    ),
    total: summarize(rows),
    healthcare: summarize(
      rows.filter((r) => r.client.vertical === "healthcare"),
    ),
    legal: summarize(rows.filter((r) => r.client.vertical === "legal")),
    dates,
    daily: dates.map((day) => ({
      day,
      healthcare: dailyValue("healthcare", day),
      legal: dailyValue("legal", day),
    })),
    stages: rows
      .flatMap((r) => r.leads)
      .reduce<Record<string, number>>((acc, l) => {
        acc[l.stage] = (acc[l.stage] ?? 0) + 1;
        return acc;
      }, {}),
  };
}
export type DashboardOverview = ReturnType<typeof aggregateDashboard>;
export type DashboardResponse = {
  current: DashboardOverview;
  previous: DashboardOverview;
  clients: DashboardClient[];
  investmentAvailable: boolean;
  canManageInvestments: boolean;
  updatedAt: string;
};
