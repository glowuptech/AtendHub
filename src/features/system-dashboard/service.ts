import { z } from "zod";
import type { ClientScope, RepositoryRegistry } from "@/domain/contracts";
import type { Client } from "@/domain/schemas";
import {
  RangeSchema,
  localDay,
  shiftDay,
  daysBetween,
} from "@/features/clients/services/overview";
export const InvestmentSchema = z.object({
  clientId: z.string().uuid(),
  day: z.iso.date(),
  amountCents: z.number().int().nonnegative().max(100000000000),
  notes: z.string().trim().max(500),
});
export type Investment = z.infer<typeof InvestmentSchema>;
export interface InvestmentRepository {
  list(clientId: string): Investment[];
  save(input: Investment): void;
  remove(clientId: string, day: string): void;
}
export class MemoryInvestments implements InvestmentRepository {
  private rows: Investment[] = [];
  constructor(private clients: { get: (id: string) => Client }) {}
  list(clientId: string) {
    this.clients.get(clientId);
    return structuredClone(this.rows.filter((r) => r.clientId === clientId));
  }
  save(input: Investment) {
    const row = InvestmentSchema.parse(input);
    this.clients.get(row.clientId);
    this.rows = this.rows.filter(
      (r) => r.clientId !== row.clientId || r.day !== row.day,
    );
    this.rows.push(structuredClone(row));
  }
  remove(clientId: string, day: string) {
    this.clients.get(clientId);
    this.rows = this.rows.filter(
      (r) => r.clientId !== clientId || r.day !== day,
    );
  }
}
export function systemOverview(
  r: RepositoryRegistry,
  scope: ClientScope,
  range: { from: string; to: string },
  vertical = "all",
  clientId = "",
) {
  RangeSchema.parse(range);
  const all = r.clients.list(scope);
  if (clientId && !all.some((c) => c.id === clientId))
    throw Error("Cliente fora do escopo");
  const clients = all.filter(
    (c) =>
      (vertical === "all" || c.vertical === vertical) &&
      (!clientId || c.id === clientId),
  );
  const dates = Array.from(
    { length: daysBetween(range.from, range.to) + 1 },
    (_, i) => shiftDay(range.from, i),
  );
  const within = (date: string) => date >= range.from && date <= range.to;
  const rows = clients.map((client) => {
    const allLeads = r.leads.list(client.id),
      leads = allLeads.filter((l) => within(localDay(l.createdAt)));
    const mirrors = r.appointments.list(client.id),
      cohortIds = new Set(leads.map((l) => l.id));
    const converted = leads.filter((l) =>
      mirrors.some((a) => a.leadId === l.id),
    ).length;
    const appointments = mirrors.filter((a) => within(localDay(a.scheduledAt)));
    const investment = r.investments
      .list(client.id)
      .filter((i) => within(i.day));
    const spent = investment.reduce((sum, i) => sum + i.amountCents, 0),
      coverage = investment.length,
      complete = coverage === dates.length;
    const responses = leads.flatMap((l) =>
      l.firstResponseAt &&
      Date.parse(l.firstResponseAt) >= Date.parse(l.createdAt)
        ? [(Date.parse(l.firstResponseAt) - Date.parse(l.createdAt)) / 60000]
        : [],
    );
    return {
      client,
      leads,
      converted,
      appointments,
      investment,
      spent,
      coverage,
      complete,
      cpl: complete && leads.length ? spent / leads.length : null,
      cpa: complete && converted ? spent / converted : null,
      responses,
      forms: r.forms.list(client.id).filter((f) => f.status !== "archived")
        .length,
      cohortAppointments: mirrors.filter((a) => cohortIds.has(a.leadId)),
    };
  });
  const summarize = (group: typeof rows) => {
    const leads = group.flatMap((r) => r.leads),
      spent = group.reduce((s, r) => s + r.spent, 0),
      converted = group.reduce((s, r) => s + r.converted, 0),
      responses = group.flatMap((r) => r.responses),
      appointments = group.flatMap((r) => r.appointments),
      complete = !!group.length && group.every((r) => r.complete);
    return {
      clients: group.length,
      active: group.filter((r) => r.client.status === "active").length,
      leads: leads.length,
      completed: leads.filter(
        (l) =>
          l.captureStatus !== "incomplete" && l.captureStatus !== "in_progress",
      ).length,
      incomplete: leads.filter(
        (l) =>
          l.captureStatus === "incomplete" || l.captureStatus === "in_progress",
      ).length,
      converted,
      conversion: leads.length ? (converted / leads.length) * 100 : null,
      spent,
      complete,
      coverage: group.reduce((s, r) => s + r.coverage, 0),
      expected: group.length * dates.length,
      cpl: complete && leads.length ? spent / leads.length : null,
      cpa: complete && converted ? spent / converted : null,
      appointments: appointments.length,
      present: appointments.filter((a) => a.attendance === "present").length,
      absent: appointments.filter((a) => a.attendance === "absent").length,
      pendingPresence: appointments.filter((a) => a.attendance === "unknown")
        .length,
      unassigned: leads.filter((l) => !l.owner).length,
      lateClaims: leads.filter((l) => l.claimAudit?.late).length,
      response: responses.length
        ? responses.reduce((a, b) => a + b, 0) / responses.length
        : null,
      responseSamples: responses.length,
      forms: group.reduce((s, r) => s + r.forms, 0),
    };
  };
  return {
    rows,
    total: summarize(rows),
    healthcare: summarize(
      rows.filter((r) => r.client.vertical === "healthcare"),
    ),
    legal: summarize(rows.filter((r) => r.client.vertical === "legal")),
    dates,
    daily: dates.map((day) => ({
      day,
      ...(Object.fromEntries(
        (["healthcare", "legal"] as const).map((v) => {
          const group = rows.filter((r) => r.client.vertical === v);
          const entries = group.flatMap((r) =>
            r.investment.filter((i) => i.day === day),
          );
          return [
            v,
            {
              leads: group
                .flatMap((r) => r.leads)
                .filter((l) => localDay(l.createdAt) === day).length,
              spent: entries.reduce((s, i) => s + i.amountCents, 0),
              coverage: entries.length,
              expected: group.length,
            },
          ];
        }),
      ) as {
        healthcare: {
          leads: number;
          spent: number;
          coverage: number;
          expected: number;
        };
        legal: {
          leads: number;
          spent: number;
          coverage: number;
          expected: number;
        };
      }),
    })),
    stages: rows
      .flatMap((r) => r.leads)
      .reduce<Record<string, number>>(
        (acc, l) => ({ ...acc, [l.stage]: (acc[l.stage] || 0) + 1 }),
        {},
      ),
  };
}
