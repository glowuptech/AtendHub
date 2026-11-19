import { test, expect } from "vitest";
import {
  businessMs,
  claimSla,
  defaultCalendar,
  CalendarSchema,
  PersistedCalendarSchema,
  clock,
  inBusinessTime,
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
  ).toBe(true);
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

test("novos estágios, tarefas e conversa preservam lead e escopo", () => {
  const r = createMockRepositories();
  const l = r.leads.list(clientA).find((l) => l.stage === "new" && !l.owner)!;
  r.leads.claim(clientA, l.id);
  for (const stage of [
    "awaiting_scheduling",
    "confirmed",
    "rescheduling",
    "recovery",
  ] as const) {
    r.leads.setStage(clientA, l.id, stage);
    expect(r.leads.get(clientA, l.id).stage).toBe(stage);
  }
  r.leads.addTask(clientA, l.id, "Retornar contato", null);
  const task = r.leads.get(clientA, l.id).tasks![0];
  r.leads.toggleTask(clientA, l.id, task.id);
  expect(r.leads.get(clientA, l.id).tasks![0].completed).toBe(true);
  expect(() => r.leads.addTask(clientB, l.id, "Contato", null)).toThrow();
  const conversation = r.inbox.ensure(clientA, l);
  expect(r.inbox.ensure(clientA, l)).toBe(conversation);
  expect(() => r.inbox.ensure(clientB, l)).toThrow();
  const noConversation = r.leads
    .list(clientA)
    .find((lead) => !r.inbox.list(clientA).some((c) => c.leadId === lead.id))!;
  if (noConversation) {
    const id = r.inbox.ensure(clientA, noConversation);
    expect(r.inbox.get(clientA, id).messages).toEqual([]);
  }
});

test("contador inicia em 10:00, desce por segundo e fica zerado no vencimento exato", () => {
  const created = "2026-11-03T09:00:00-03:00";
  const start = Date.parse(created);
  expect(clock(claimSla(created, start, defaultCalendar).remainingMs)).toBe(
    "10:00",
  );
  expect(
    clock(claimSla(created, start + 100, defaultCalendar).remainingMs),
  ).toBe("10:00");
  expect(
    clock(claimSla(created, start + 1000, defaultCalendar).remainingMs),
  ).toBe("09:59");
  expect(
    clock(claimSla(created, start + 599000, defaultCalendar).remainingMs),
  ).toBe("00:01");
  expect(claimSla(created, start + 600000, defaultCalendar)).toMatchObject({
    remainingMs: 0,
    overdue: true,
  });
  expect(
    clock(claimSla(created, start + 3600000, defaultCalendar).remainingMs),
  ).toBe("00:00");
});

test("lead recebido no fim de semana só começa a consumir tempo na abertura", () => {
  const created = "2026-11-07T10:00:00-03:00";
  expect(
    claimSla(created, Date.parse("2026-11-09T08:59:59-03:00"), defaultCalendar)
      .remainingMs,
  ).toBe(600000);
  expect(
    claimSla(created, Date.parse("2026-11-09T09:00:01-03:00"), defaultCalendar)
      .remainingMs,
  ).toBe(599000);
  expect(
    inBusinessTime(Date.parse("2026-11-09T09:00:00-03:00"), defaultCalendar),
  ).toBe(true);
  expect(
    inBusinessTime(Date.parse("2026-11-09T17:00:00-03:00"), defaultCalendar),
  ).toBe(false);
});

test("saldo parcial atravessa fechamento, fim de semana, feriado e dia excepcional fechado", () => {
  const c = {
    ...defaultCalendar,
    holidays: ["2026-11-09"],
    exceptions: { "2026-11-10": { start: null, end: null } },
  };
  const created = "2026-11-06T16:55:30-03:00";
  expect(
    clock(
      claimSla(created, Date.parse("2026-11-11T08:59:59-03:00"), c).remainingMs,
    ),
  ).toBe("05:30");
  expect(
    clock(
      claimSla(created, Date.parse("2026-11-11T09:04:31-03:00"), c).remainingMs,
    ),
  ).toBe("00:59");
});

test("abertura excepcional no sábado é respeitada, e feriado continua fechado", () => {
  const c = {
    ...defaultCalendar,
    exceptions: { "2026-11-07": { start: "10:00", end: "12:00" } },
  };
  expect(
    businessMs("2026-11-07T09:00:00-03:00", "2026-11-07T10:05:00-03:00", c),
  ).toBe(300000);
  expect(
    businessMs("2026-11-07T09:00:00-03:00", "2026-11-07T10:05:00-03:00", {
      ...c,
      holidays: ["2026-11-07"],
    }),
  ).toBe(0);
});

test("dia útil usa o calendário local mesmo quando a data UTC ainda é domingo", () => {
  expect(
    businessMs("2026-11-02T09:00:00+14:00", "2026-11-02T09:01:00+14:00", {
      ...defaultCalendar,
      timezone: "Pacific/Kiritimati",
    }),
  ).toBe(60000);
  expect(
    businessMs("2026-03-08T01:00:00-05:00", "2026-03-08T04:00:00-04:00", {
      ...defaultCalendar,
      timezone: "America/New_York",
      days: [0],
      start: "01:00",
      end: "04:00",
    }),
  ).toBe(7200000);
});

test("calendário persistido normaliza TIME e rejeita fuso e exceções inválidos", () => {
  expect(
    PersistedCalendarSchema.parse({
      timezone: "America/Sao_Paulo",
      weekdays: [1],
      workStart: "09:00:00",
      workEnd: "17:00:00",
      holidays: [],
    }),
  ).toMatchObject({ start: "09:00", end: "17:00", days: [1], exceptions: {} });
  expect(
    CalendarSchema.safeParse({ ...defaultCalendar, timezone: "invalido" })
      .success,
  ).toBe(false);
  expect(
    CalendarSchema.safeParse({
      ...defaultCalendar,
      exceptions: { "2026-11-09": { start: "17:00", end: "09:00" } },
    }).success,
  ).toBe(false);
  expect(
    CalendarSchema.safeParse({
      ...defaultCalendar,
      exceptions: { "2026-11-09": { start: null, end: "09:00" } },
    }).success,
  ).toBe(false);
});
