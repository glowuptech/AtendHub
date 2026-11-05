import { test, expect, vi } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB } from "@/lib/mocks/fixtures";
import {
  defaultRules,
  emptyPreferences,
  type Cadence,
  type Step,
} from "@/features/automation/config";
import { workingTime } from "@/features/automation/engine";
import { defaultCalendar } from "@/features/queue/calendar";
import { emptyWebhookConfig } from "@/features/webhooks/config";
import { rangeSlots } from "@/features/appointments/services/schedule";
import {
  deliverAutomationEvent,
  automationDestination,
} from "@/lib/webhooks/automation";
const now = Date.parse("2026-11-05T15:00:00Z");
const webhooks = {
  ...emptyWebhookConfig(),
  followups: "https://example.com/followup",
  reminders: "https://example.com/reminders",
};
const step = (minutes = 30, purpose: Step["purpose"] = "followup"): Step => ({
  id: crypto.randomUUID(),
  minutes,
  purpose,
  whatsapp: false,
  sms: true,
  whatsappText: "",
  smsText: "Olá, {nome}",
});
const cadence = (steps: Step[]): Cadence => ({
  enabled: true,
  businessHours: false,
  steps,
});
function setup() {
  const r = createMockRepositories(),
    lead = r.leads.list(clientA)[1],
    originalLeads = r.leads.list.bind(r.leads),
    originalInbox = r.inbox.list.bind(r.inbox);
  const messages = [
    {
      id: crypto.randomUUID(),
      direction: "outbound" as const,
      body: "Como posso ajudar?",
      at: "2026-11-05T14:00:00.000Z",
      status: "sent" as "sent" | "received",
      automationJobId: undefined as string | undefined,
    },
  ];
  vi.spyOn(r.leads, "list").mockImplementation((id) =>
    originalLeads(id).map((l) =>
      l.id === lead.id
        ? { ...l, contact: { name: l.name, phone: "11999998888", email: "" } }
        : l,
    ),
  );
  vi.spyOn(r.inbox, "list").mockImplementation((id) =>
    originalInbox(id).map((c) =>
      c.leadId === lead.id
        ? { ...c, messages: messages as typeof c.messages }
        : c,
    ),
  );
  r.leads.setStage(clientA, lead.id, "waiting");
  r.automations.setPreferences(clientA, lead.id, {
    ...emptyPreferences(),
    sms: true,
    source: "Preferência registrada",
  });
  return { r, lead, messages };
}
test("follow-up é sequencial, idempotente e cancela ao responder sem reiniciar por mensagem automática", () => {
  const { r, lead, messages } = setup(),
    steps = [step(), step(60)];
  r.automations.saveConfig(clientA, "followup", cadence(steps));
  r.automations.reconcile(defaultCalendar, webhooks, now);
  const job = r.automations.list(clientA)[0];
  expect(job.status).toBe("queued");
  expect(job.text).toContain(lead.name);
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.outbox(clientA)).toHaveLength(1);
  expect(() => r.automations.recordResult(clientB, job.id, "sent")).toThrow();
  r.automations.recordResult(
    clientA,
    job.id,
    "sent",
    new Date(now).toISOString(),
  );
  messages.push({
    ...messages[0],
    id: crypto.randomUUID(),
    at: new Date(now).toISOString(),
    automationJobId: job.id,
  });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(
    r.automations.list(clientA).filter((j) => j.stepIndex === 0),
  ).toHaveLength(1);
  expect(
    r.automations.list(clientA).find((j) => j.stepIndex === 1)?.status,
  ).toBe("scheduled");
  messages.push({
    ...messages[0],
    id: crypto.randomUUID(),
    direction: "inbound" as "outbound",
    status: "received",
    at: new Date(now + 1000).toISOString(),
    automationJobId: undefined,
  });
  r.automations.reconcile(defaultCalendar, webhooks, now + 1000);
  expect(
    r.automations.list(clientA).find((j) => j.stepIndex === 1)?.status,
  ).toBe("cancelled");
  expect(r.automations.outbox(clientA)).toHaveLength(0);
});
test("recusa e pausa cancelam tarefas e retiram eventos da fila pendente", () => {
  const { r, lead } = setup();
  r.automations.saveConfig(clientA, "followup", cadence([step()]));
  r.automations.reconcile(defaultCalendar, webhooks, now);
  r.automations.setPreferences(clientA, lead.id, {
    ...emptyPreferences(),
    optOut: true,
  });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.list(clientA)[0].status).toBe("cancelled");
  expect(r.automations.outbox()).toHaveLength(0);
  expect(r.automations.list(clientB)).toEqual([]);
  expect(() =>
    r.automations.getConfig(crypto.randomUUID(), "followup"),
  ).toThrow();
});
test("nenhum envio sem autorização ou destino e não há duplicação ao restaurar URL", () => {
  const { r, lead } = setup();
  r.automations.saveConfig(clientA, "followup", cadence([step()]));
  r.automations.setPreferences(clientA, lead.id, emptyPreferences());
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.list(clientA)[0].status).toBe("blocked");
  r.automations.setPreferences(clientA, lead.id, {
    ...emptyPreferences(),
    sms: true,
    source: "Registrada",
  });
  r.automations.reconcile(defaultCalendar, emptyWebhookConfig(), now);
  expect(r.automations.list(clientA)[0].reason).toContain("webhook");
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.outbox()).toHaveLength(1);
  r.automations.reconcile(defaultCalendar, emptyWebhookConfig(), now);
  expect(r.automations.outbox()).toHaveLength(0);
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.outbox()).toHaveLength(1);
});
test("regras da fila respeitam estado, responsável e eventos aceitos do provedor", () => {
  const { r, lead, messages } = setup();
  r.leads.setStage(clientA, lead.id, "in_progress");
  r.automations.saveRules({ ...defaultRules(), outbound: true, inbound: true });
  messages.push({
    ...messages[0],
    id: crypto.randomUUID(),
    at: new Date(now).toISOString(),
  });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.leads.get(clientA, lead.id).stage).toBe("waiting");
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.history()).toHaveLength(1);
  messages.push({
    ...messages[0],
    id: crypto.randomUUID(),
    direction: "inbound" as "outbound",
    status: "received",
    at: new Date(now).toISOString(),
  });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.leads.get(clientA, lead.id).stage).toBe("in_progress");
  r.leads.setStage(clientA, lead.id, "lost");
  messages.push({
    ...messages[0],
    id: crypto.randomUUID(),
    at: new Date(now + 1).toISOString(),
  });
  r.automations.reconcile(defaultCalendar, webhooks, now + 1);
  expect(r.leads.get(clientA, lead.id).stage).toBe("lost");
});
test("confirmação cancela somente pedido pendente; remarcação cancela lembretes", () => {
  const { r, lead } = setup(),
    doctor = r.clients.get(clientA).doctors[0].id;
  r.schedule.save(clientA, {
    doctorId: doctor,
    week: "2026-11-09",
    slots: rangeSlots("2026-11-09", "09:00", "15:00"),
    defaultDuration: 30,
    displayStep: 30,
  });
  r.automations.saveRules({
    ...defaultRules(),
    booked: true,
    confirmed: true,
    rescheduling: true,
  });
  const a = r.schedule.book(clientA, {
    id: crypto.randomUUID(),
    doctorId: doctor,
    leadId: lead.id,
    day: "2026-11-09",
    time: "11:00",
    duration: 30,
    notes: "",
  });
  r.automations.saveConfig(
    clientA,
    "reminder",
    cadence([step(120, "confirmation"), step(60, "reminder")]),
  );
  const at = Date.parse("2026-11-09T12:00:00Z");
  r.automations.reconcile(defaultCalendar, webhooks, at);
  expect(r.leads.get(clientA, lead.id).stage).toBe("scheduled");
  expect(r.automations.list(clientA)).toHaveLength(2);
  r.appointments.setStatus(clientA, a.id, "confirmed");
  r.automations.reconcile(defaultCalendar, webhooks, at);
  expect(r.leads.get(clientA, lead.id).stage).toBe("confirmed");
  expect(
    r.automations.list(clientA).find((j) => j.stepIndex === 0)?.status,
  ).toBe("cancelled");
  expect(
    r.automations.list(clientA).find((j) => j.stepIndex === 1)?.status,
  ).toBe("scheduled");
  r.appointments.setStatus(clientA, a.id, "rescheduling");
  r.automations.reconcile(defaultCalendar, webhooks, at);
  expect(
    r.automations.list(clientA).every((j) => j.status === "cancelled"),
  ).toBe(true);
  expect(r.leads.get(clientA, lead.id).stage).toBe("rescheduling");
});
test("calendário pula fim de semana e feriado e mensagens vazias são rejeitadas", () => {
  expect(
    workingTime(Date.parse("2026-11-06T21:00:00Z"), {
      ...defaultCalendar,
      holidays: ["2026-11-09"],
    }),
  ).toBe(Date.parse("2026-11-10T12:00:00Z"));
  const { r } = setup();
  expect(() =>
    r.automations.saveConfig(
      clientA,
      "followup",
      cadence([{ ...step(), smsText: "" }]),
    ),
  ).toThrow();
});
test("adapter reutiliza assinatura/idempotência e só despacha quando chamado por worker", async () => {
  const { r } = setup();
  r.automations.saveConfig(clientA, "followup", cadence([step()]));
  r.automations.reconcile(defaultCalendar, webhooks, now);
  const event = r.automations.outbox()[0],
    transport = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
  expect(automationDestination(event)).toBe("followups");
  expect((await deliverAutomationEvent(event, {}, 0, transport)).status).toBe(
    "unconfigured",
  );
  expect(transport).not.toHaveBeenCalled();
  await deliverAutomationEvent(
    event,
    { url: "https://example.com", secret: "test" },
    0,
    transport,
  );
  expect(transport.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    event.dedupeKey,
  );
});
test("mensagem pendente só move o card ao ser aceita; recibos não repetem a regra", () => {
  const { r, lead, messages } = setup();
  r.leads.setStage(clientA, lead.id, "in_progress");
  const m = messages[0] as { status: string };
  m.status = "pending";
  r.automations.saveRules({ ...defaultRules(), outbound: true });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.leads.get(clientA, lead.id).stage).toBe("in_progress");
  m.status = "sent";
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.leads.get(clientA, lead.id).stage).toBe("waiting");
  m.status = "read";
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.automations.history()).toHaveLength(1);
});
test("reprogramar horário invalida tarefas antigas e não recupera disparos de antecedência perdida", () => {
  const { r, lead } = setup(),
    doctor = r.clients.get(clientA).doctors[0].id;
  r.schedule.save(clientA, {
    doctorId: doctor,
    week: "2026-11-09",
    slots: rangeSlots("2026-11-09", "09:00", "15:00"),
    defaultDuration: 30,
    displayStep: 30,
  });
  const a = r.schedule.book(clientA, {
    id: crypto.randomUUID(),
    doctorId: doctor,
    leadId: lead.id,
    day: "2026-11-09",
    time: "11:00",
    duration: 30,
    notes: "",
  });
  r.automations.saveConfig(
    clientA,
    "reminder",
    cadence([step(120, "confirmation")]),
  );
  const at = Date.parse("2026-11-09T09:00:00Z");
  r.automations.reconcile(defaultCalendar, webhooks, at);
  const old = r.automations.list(clientA)[0];
  const original = r.appointments.list.bind(r.appointments);
  vi.spyOn(r.appointments, "list").mockImplementation((id) =>
    original(id).map((row) =>
      row.id === a.id ? { ...row, scheduledAt: "2026-11-09T15:00:00Z" } : row,
    ),
  );
  r.automations.reconcile(defaultCalendar, webhooks, at);
  expect(r.automations.list(clientA).find((j) => j.id === old.id)?.status).toBe(
    "cancelled",
  );
  expect(
    r.automations.list(clientA).filter((j) => j.status === "scheduled"),
  ).toHaveLength(1);
});
test("habilitar regras não reaplica mensagens já existentes", () => {
  const { r, lead } = setup();
  r.leads.setStage(clientA, lead.id, "in_progress");
  r.automations.saveRules({ ...defaultRules(), outbound: true });
  r.automations.reconcile(defaultCalendar, webhooks, now);
  expect(r.leads.get(clientA, lead.id).stage).toBe("in_progress");
  expect(r.automations.history()).toHaveLength(0);
});
