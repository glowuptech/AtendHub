import { test, expect } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB, uid } from "@/lib/mocks/fixtures";
import { settingsOf } from "@/features/forms/services/settings";
import { deliverCaptureEvent } from "@/lib/webhooks/delivery";
function setup() {
  const r = createMockRepositories();
  const id = r.forms.duplicate(clientA, uid(300));
  const f = r.forms.get(clientA, id);
  const v = f.versions[0];
  v.steps = v.steps.slice(0, 1);
  v.settings = settingsOf();
  v.settings.contactPosition = "start";
  v.settings.tracking.pixelId = "123456789";
  v.steps[0].metaEvent = "PrimeiraEtapa";
  r.forms.save(clientA, f);
  r.forms.snapshot(clientA, id);
  const input = {
    clientId: clientA,
    formId: id,
    versionId: v.id,
    sessionId: "test-session",
    contacts: { name: "Contato Teste", phone: "11999999999", email: "" },
    answers: {} as Record<string, string>,
    complete: false,
  };
  return { r, f, v, input };
}
test("cadastro parcial, abandono, retomada e conclusão atualizam um lead com eventos únicos", () => {
  const { r, v, input } = setup();
  const id = r.capture.capture(input, 1000)!;
  expect(r.leads.get(clientA, id).captureStatus).toBe("in_progress");
  r.capture.sweep(1000 + 30 * 60000);
  r.capture.sweep(1000 + 31 * 60000);
  expect(r.leads.get(clientA, id).captureStatus).toBe("incomplete");
  expect(r.capture.listEvents(clientA)).toHaveLength(1);
  const final = {
    ...input,
    answers: { [v.steps[0].question.id]: "Resposta de teste" },
    complete: true,
  };
  expect(r.capture.capture(final, 2000000)).toBe(id);
  expect(r.capture.capture(final, 2000100)).toBe(id);
  expect(r.leads.get(clientA, id).captureStatus).toBe("completed");
  expect(r.leads.get(clientA, id).fields[0].value).toBe("Resposta de teste");
  expect(r.capture.listEvents(clientA).map((e) => e.eventType)).toEqual([
    "lead.incomplete",
    "lead.completed",
  ]);
  expect(
    r.capture.listMarketing(clientA).filter((e) => e.eventName === "Lead"),
  ).toHaveLength(1);
});
test("respostas e contatos inválidos não criam lead ou evento de conclusão", () => {
  const { r, input } = setup();
  expect(() => r.capture.capture({ ...input, complete: true })).toThrow();
  expect(() =>
    r.capture.capture({
      ...input,
      contacts: { ...input.contacts, phone: "abc" },
    }),
  ).toThrow();
  expect(r.capture.listEvents(clientA)).toHaveLength(0);
  expect(r.leads.list(clientA)).toHaveLength(3);
});
test("escopo e versão preservados, visitas e ações deduplicadas", () => {
  const { r, v, input } = setup();
  expect(() => r.capture.capture({ ...input, clientId: clientB })).toThrow();
  r.capture.view(input);
  r.capture.view(input);
  expect(r.capture.stats(clientA, input.formId).views).toBe(1);
  r.capture.action(input, v.steps[0].actionId);
  r.capture.action(input, v.steps[0].actionId);
  expect(r.capture.listActions(clientA)).toHaveLength(1);
  expect(JSON.stringify(r.capture.listMarketing(clientA))).not.toContain(
    "11999999999",
  );
  expect(r.capture.listEvents(clientB)).toHaveLength(0);
  const form = r.forms.get(clientA, input.formId);
  form.versions[0].steps[0].question.label = "Alterada";
  expect(() => r.forms.save(clientA, form)).toThrow("Snapshot imutável");
});
test("webhook sem URL não faz rede; assinatura, deduplicação e retentativa no adaptador", async () => {
  const { r, v, input } = setup();
  r.capture.capture({
    ...input,
    answers: { [v.steps[0].question.id]: "Resposta" },
    complete: true,
  });
  const event = r.capture.listEvents(clientA)[0];
  const calls: RequestInit[] = [];
  const transport = (async (_url: unknown, init: RequestInit) => {
    calls.push(init);
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  expect((await deliverCaptureEvent(event, {}, transport)).status).toBe(
    "unconfigured",
  );
  expect(calls).toHaveLength(0);
  expect(
    (
      await deliverCaptureEvent(
        event,
        { url: "https://example.com/hook", secret: "test-secret" },
        transport,
      )
    ).status,
  ).toBe("retry");
  expect((calls[0].headers as Record<string, string>)["Idempotency-Key"]).toBe(
    event.id,
  );
  expect(
    (calls[0].headers as Record<string, string>)["X-AtendHub-Signature"],
  ).toHaveLength(64);
});

test("retoma respostas dentro da sessão sem atravessar o escopo do cliente", () => {
  const { r, input, v } = setup();
  const id = r.capture.capture({ ...input, nextIndex: 1 }, 1000);
  expect(r.capture.progress(clientA, input.formId, v.id)?.nextIndex).toBe(1);
  expect(() => r.capture.progress(clientB, input.formId, v.id)).toThrow();
  expect(id).toBeTruthy();
});
