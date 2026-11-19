import { expect, it } from "vitest";
import { aggregateDashboard } from "@/features/system-dashboard/metrics";
import {
  readPages,
  missingInvestmentTable,
} from "@/features/system-dashboard/server";
import { dataset, a, b } from "../fixtures/dashboard";
const range = { from: "2026-11-03", to: "2026-11-03" };
it("usa a data local, distingue coorte e consulta, exclui cancelados da conversão e não inventa histórico de SLA", () => {
  const result = aggregateDashboard(dataset(), range);
  expect(result.total).toMatchObject({
    clients: 2,
    active: 1,
    leads: 3,
    completed: 2,
    incomplete: 1,
    converted: 1,
    appointments: 1,
    cancelled: 1,
    absent: 1,
    present: 0,
    unassigned: 1,
    response: 2,
    responseSamples: 1,
    forms: 1,
    lateClaims: null,
    cpl: null,
  });
  expect(result.total.conversion).toBeCloseTo(100 / 3);
  expect(result.daily[0].healthcare.leads).toBe(2);
  expect(result.legal.converted).toBe(0); // Stage scheduled is not an appointment.
  expect(JSON.stringify(result)).not.toContain("firstResponseAt");
  expect(JSON.stringify(result)).not.toContain("actor");
});
it("custos são razão de totais com cobertura integral, ausência difere de zero e filtros mantêm o escopo", () => {
  const input = dataset();
  input.investments = [
    { clientId: a, day: range.from, amountCents: 10000, notes: "" },
    { clientId: b, day: range.from, amountCents: 5000, notes: "" },
  ];
  expect(aggregateDashboard(input, range).total.cpl).toBe(5000);
  expect(aggregateDashboard(input, range).total.cpa).toBe(15000);
  expect(aggregateDashboard(input, range, "healthcare", a).total.leads).toBe(2);
  expect(aggregateDashboard(input, range, "legal").total.leads).toBe(1);
  input.investments = [
    { clientId: a, day: range.from, amountCents: 0, notes: "conferido" },
  ];
  expect(aggregateDashboard(input, range, "all", a).total.cpl).toBe(0);
  expect(aggregateDashboard(input, range).total.cpl).toBeNull();
  expect(() => aggregateDashboard(input, range, "all", "out-of-scope")).toThrow(
    "escopo",
  );
});
it("paginação não descarta os registros após a primeira página e falhas não se transformam em zero", async () => {
  const rows = Array.from({ length: 1255 }, (_, id) => ({ id }));
  const result = await readPages<{ id: number }>(async (start, end) => ({
    data: rows.slice(start, end + 1),
    error: null,
  }));
  expect(result).toHaveLength(1255);
  await expect(
    readPages(async () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    })),
  ).rejects.toMatchObject({ code: "42501" });
  expect(missingInvestmentTable({ code: "PGRST205" })).toBe(true);
  expect(missingInvestmentTable({ code: "42501" })).toBe(false);
});
