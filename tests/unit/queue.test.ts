import { test, expect } from "vitest";
import {
  businessMs,
  claimSla,
  defaultCalendar,
  CalendarSchema,
} from "@/features/queue/calendar";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB } from "@/lib/mocks/fixtures";
test("prazo pausa à noite, fim de semana e feriados", () => {
  const c = { ...defaultCalendar, holidays: ["2026-11-02"] };
  expect(
    businessMs("2026-10-30T16:55:00-03:00", "2026-11-03T09:05:00-03:00", c),
  ).toBe(600000);
  expect(
    claimSla(
      "2026-11-03T09:00:00-03:00",
      Date.parse("2026-11-03T09:10:00-03:00"),
      c,
    ).overdue,
  ).toBe(false);
  expect(
    claimSla(
      "2026-11-03T09:00:00-03:00",
      Date.parse("2026-11-03T09:10:01-03:00"),
      c,
    ).overdue,
  ).toBe(true);
  expect(
    businessMs("2026-11-07T12:00:00-03:00", "2026-11-08T12:00:00-03:00", c),
  ).toBe(0);
  expect(
    CalendarSchema.safeParse({ ...c, start: "18:00", end: "09:00" }).success,
  ).toBe(false);
});
test("claim registra tempo e calendário; impede dupla atribuição e acesso cruzado", () => {
  const r = createMockRepositories();
  const lead = r.leads
    .list(clientA)
    .find((l) => l.stage === "new" && !l.owner)!;
  expect(() => r.leads.claim(clientB, lead.id)).toThrow();
  r.leads.claim(clientA, lead.id);
  const saved = r.leads.get(clientA, lead.id);
  expect(saved.claimAudit?.targetMinutes).toBe(10);
  expect(saved.claimedAt).toBeTruthy();
  expect(() => r.leads.claim(clientA, lead.id)).toThrow();
  r.leads.setStage(clientA, lead.id, "waiting");
  expect(r.leads.get(clientA, lead.id).stage).toBe("waiting");
});
