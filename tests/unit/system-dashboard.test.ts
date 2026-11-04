import { test, expect } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { systemOverview } from "@/features/system-dashboard/service";
import { clientA, clientB, demoScope } from "@/lib/mocks/fixtures";
const range = { from: "2026-11-03", to: "2026-11-03" };
test("agrega por frente e calcula CPL ponderado com investimento completo", () => {
  const r = createMockRepositories();
  const b = r.clients.get(clientB);
  r.clients.update(clientB, { ...b, vertical: "legal" });
  r.investments.save({
    clientId: clientA,
    day: range.from,
    amountCents: 10000,
    notes: "Meta",
  });
  r.investments.save({
    clientId: clientB,
    day: range.from,
    amountCents: 5000,
    notes: "Meta",
  });
  const d = systemOverview(r, demoScope, range);
  expect(d.total.clients).toBe(2);
  expect(d.healthcare.clients).toBe(1);
  expect(d.legal.clients).toBe(1);
  expect(d.total.spent).toBe(15000);
  expect(d.total.cpl).toBe(15000 / d.total.leads);
  expect(d.healthcare.cpl).toBe(10000 / d.healthcare.leads);
  expect(d.daily[0].legal.spent).toBe(5000);
  expect(d.total.converted).toBe(2);
  expect(d.healthcare.converted).toBe(1);
  expect(d.legal.converted).toBe(1);
});
test("ausência difere de gasto zero; editar substitui; remover restaura lacuna", () => {
  const r = createMockRepositories();
  expect(systemOverview(r, demoScope, range).total.cpl).toBeNull();
  r.investments.save({
    clientId: clientA,
    day: range.from,
    amountCents: 0,
    notes: "Sem anúncios",
  });
  expect(systemOverview(r, demoScope, range, "all", clientA).total.cpl).toBe(0);
  expect(systemOverview(r, demoScope, range).total.cpl).toBeNull();
  r.investments.save({
    clientId: clientA,
    day: range.from,
    amountCents: 2000,
    notes: "Ajustado",
  });
  expect(r.investments.list(clientA)).toHaveLength(1);
  r.investments.remove(clientA, range.from);
  expect(
    systemOverview(r, demoScope, range, "all", clientA).total.cpl,
  ).toBeNull();
});
test("filtros e cobertura evitam custos incompletos, sem vazar escopo", () => {
  const scope = { ...demoScope, clientIds: [clientA] };
  const r = createMockRepositories(scope);
  expect(() =>
    r.investments.save({
      clientId: clientB,
      day: range.from,
      amountCents: 100,
      notes: "",
    }),
  ).toThrow();
  expect(() => r.investments.list(clientB)).toThrow();
  expect(() => systemOverview(r, scope, range, "all", clientB)).toThrow();
  expect(() =>
    r.investments.save({
      clientId: clientA,
      day: range.from,
      amountCents: -1,
      notes: "",
    }),
  ).toThrow();
  expect(systemOverview(r, scope, range, "legal").total.clients).toBe(0);
  r.investments.save({
    clientId: clientA,
    day: range.from,
    amountCents: 100,
    notes: "",
  });
  expect(
    systemOverview(r, scope, { from: "2026-11-02", to: range.to }).total.cpl,
  ).toBeNull();
  expect(() =>
    systemOverview(r, scope, { from: "2026-11-04", to: range.from }),
  ).toThrow();
});
