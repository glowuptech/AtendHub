import { describe, it, expect } from "vitest";
import { createMockRepositories, ScopeError } from "@/lib/mocks/repositories";
import {
  clientA,
  clientB,
  organizationId,
  uid,
  forms,
  fields,
} from "@/lib/mocks/fixtures";
import { FieldSchema, validateAnswer, EventSchema } from "@/domain/schemas";
import {
  MemoryFormEventRecorder,
  DisabledMarketingProvider,
} from "@/lib/tracking/internal";
describe("Fronteiras de cliente", () => {
  it("recusa listagens e IDs de outra clínica em todas as features", () => {
    const r = createMockRepositories({ organizationId, clientIds: [clientA] });
    for (const repo of [r.fields, r.forms, r.leads, r.inbox, r.appointments])
      expect(() => repo.list(clientB)).toThrow(ScopeError);
    expect(() => r.leads.get(clientA, uid(603))).toThrow(ScopeError);
    expect(() => r.clients.get(clientB)).toThrow(ScopeError);
    expect(() => r.analytics.get(clientA, uid(500), uid(510))).toThrow(
      ScopeError,
    );
  });
  it("recusa relacionamento de campo cruzado e preserva a clínica B", () => {
    const r = createMockRepositories();
    const f = r.forms.get(clientA, uid(300));
    f.versions[0].steps[0].question.fieldDefinitionId = uid(201);
    expect(() => r.forms.save(clientA, f)).toThrow();
    expect(r.fields.list(clientB)).toHaveLength(5);
  });
  it("listagens devolvem cópias sem mutação indireta", () => {
    const r = createMockRepositories();
    const l = r.leads.list(clientA);
    l[0].name = "alterado";
    expect(r.leads.list(clientA)[0].name).not.toBe("alterado");
  });
  it("claim demonstrativo mantém titularidade", () => {
    const r = createMockRepositories();
    r.leads.claim(clientA, uid(600));
    expect(() => r.leads.claim(clientA, uid(600))).toThrow("responsável");
    expect(r.leads.get(clientA, uid(600)).history).toHaveLength(2);
  });
});
describe("Formulários e campos", () => {
  it("ginecologia e obstetrícia reutilizam IDs, mas possuem perguntas distintas", () => {
    const a = forms[0].versions[0],
      b = forms[1].versions[0];
    expect(
      a.steps.slice(0, 3).map((s) => s.question.fieldDefinitionId),
    ).toEqual(b.steps.slice(0, 3).map((s) => s.question.fieldDefinitionId));
    expect(a.steps[0].question.id).not.toBe(b.steps[0].question.id);
    expect(a.steps[3].question.fieldDefinitionId).not.toBe(
      b.steps[3].question.fieldDefinitionId,
    );
  });
  it("bloqueia todas as chaves reservadas", () => {
    for (const stableKey of [
      "id",
      "organization_id",
      "client_id",
      "lead_id",
      "contact_id",
      "status",
      "owner_id",
      "tenant_id",
      "provider_id",
    ])
      expect(FieldSchema.safeParse({ ...fields[0], stableKey }).success).toBe(
        false,
      );
  });
  it("preserva snapshots e duplica com novos IDs", () => {
    const r = createMockRepositories(),
      old = r.forms.get(clientA, uid(300));
    const modified = structuredClone(old);
    modified.versions[0].steps[0].title = "Mudança";
    expect(() => r.forms.save(clientA, modified)).toThrow("imutável");
    const copyId = r.forms.duplicate(clientA, old.id),
      copy = r.forms.get(clientA, copyId);
    expect(copy.versions[0].steps[0].id).not.toBe(old.versions[0].steps[0].id);
    expect(copy.versions[0].steps[0].question.fieldDefinitionId).toBe(
      old.versions[0].steps[0].question.fieldDefinitionId,
    );
    expect(r.forms.get(clientA, old.id)).toEqual(old);
  });
  it("valida contato, seleção, consentimento e ausência sem transformá-la em não", () => {
    expect(() => validateAnswer(fields[1], true, "123")).toThrow();
    expect(validateAnswer(fields[1], true, "+5500000000000")).toBe(
      "+5500000000000",
    );
    expect(() => validateAnswer(fields[2], true, "invalid")).toThrow();
    expect(validateAnswer(fields[3], false, null)).toBeNull();
    expect(validateAnswer(fields[3], true, false)).toBe(false);
    expect(() => validateAnswer(fields[4], true, false)).toThrow();
  });
  it("edita valor mantendo proveniência e histórico", () => {
    const r = createMockRepositories();
    r.leads.editField(clientA, uid(600), uid(103), "afternoon");
    const l = r.leads.get(clientA, uid(600));
    expect(l.fields[2].value).toBe("afternoon");
    expect(l.fields[2].actor).toBe("Edição humana DEMO");
    expect(l.history.at(-1)?.label).toContain("morning → afternoon");
  });
});
describe("Eventos e métricas", () => {
  const event = {
    eventId: uid(2000),
    formId: uid(300),
    versionId: uid(310),
    sessionId: uid(2001),
    eventType: "form_view" as const,
    timestamp: "2026-11-03T15:00:00.000Z",
  };
  it("rejeita PII e quaisquer chaves fora da allowlist", () => {
    for (const key of ["name", "phone", "answers", "specialty", "body"])
      expect(
        EventSchema.safeParse({ ...event, [key]: "não permitido" }).success,
      ).toBe(false);
  });
  it("recorder é local e deduplicado; marketing permanece desativado", () => {
    const r = new MemoryFormEventRecorder();
    r.record(event);
    r.record(event);
    expect(r.list(event.sessionId)).toHaveLength(1);
    expect(new DisabledMarketingProvider().enabled).toBe(false);
    r.clear(event.sessionId);
    expect(r.list(event.sessionId)).toHaveLength(0);
  });
  it("analytics usam o contrato 100 → 55 → 38 e não chamam serviços", () => {
    const r = createMockRepositories(),
      a = r.analytics.get(clientA, uid(300), uid(310));
    expect(a.views).toBe(100);
    expect(a.steps[2].viewed).toBe(55);
    expect(a.submissions).toBe(38);
    expect(a.steps.reduce((sum, s) => sum + s.abandoned, 0)).toBe(a.abandoned);
  });
});
