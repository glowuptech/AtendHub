import { MemoryInvestments } from "@/features/system-dashboard/service";
import {
  claimSla,
  defaultCalendar,
  type BusinessCalendar,
} from "@/features/queue/calendar";
import { MemoryCaptureRepository } from "@/features/forms/services/capture";
import type {
  ClientScope,
  ScopedRepository,
  ClientRepository,
  LeadRepository,
  FieldRepository,
  FormRepository,
  InboxRepository,
  AppointmentRepository,
  AnalyticsRepository,
} from "@/domain/contracts";
import {
  ClientSchema,
  LeadSchema,
  StageSchema,
  FieldSchema,
  FormSchema,
  validateAnswer,
  type Lead,
  type CustomFieldDefinition,
  type FormDefinition,
  type Conversation,
  type AppointmentMirror,
  type FieldValue,
} from "@/domain/schemas";
import * as fixture from "./fixtures";
export class ScopeError extends Error {
  constructor() {
    super("Acesso negado: recurso fora do escopo desta clínica");
  }
}
export class ScopedMockRepository<
  T extends { id: string; clientId: string; organizationId: string },
> implements ScopedRepository<T> {
  constructor(
    protected rows: T[],
    protected scope: ClientScope,
  ) {}
  protected check(clientId: string) {
    if (!this.scope.clientIds.includes(clientId)) throw new ScopeError();
  }
  list(clientId: string) {
    this.check(clientId);
    return structuredClone(
      this.rows.filter(
        (r) =>
          r.clientId === clientId &&
          r.organizationId === this.scope.organizationId,
      ),
    );
  }
  get(clientId: string, id: string) {
    const r = this.list(clientId).find((r) => r.id === id);
    if (!r) throw new ScopeError();
    return r;
  }
  protected row(clientId: string, id: string) {
    this.get(clientId, id);
    return this.rows.find((r) => r.id === id && r.clientId === clientId)!;
  }
}
export class MockClientRepository implements ClientRepository {
  private rows = structuredClone(fixture.clients);
  constructor(private scope: ClientScope) {}
  update(clientId: string, input: import("@/domain/schemas").Client) {
    const old = this.get(clientId);
    const client = ClientSchema.parse(input);
    if (client.id !== clientId || client.organizationId !== old.organizationId)
      throw new ScopeError();
    const usedDoctorIds = [...fixture.leads, ...fixture.forms]
      .filter((r) => r.clientId === clientId)
      .map((r) => r.doctorId)
      .filter(Boolean);
    if (usedDoctorIds.some((id) => !client.doctors.some((d) => d.id === id)))
      throw Error(
        "Médico com histórico não pode ser removido nesta demonstração.",
      );
    if (new Set(client.doctors.map((d) => d.id)).size !== client.doctors.length)
      throw Error("Identificadores de médicos duplicados");
    this.rows[this.rows.findIndex((c) => c.id === clientId)] =
      structuredClone(client);
  }
  create(input: import("@/domain/schemas").Client) {
    const client = ClientSchema.parse(input);
    if (client.organizationId !== this.scope.organizationId)
      throw new ScopeError();
    if (this.rows.some((c) => c.id === client.id))
      throw Error("Cadastro já existe");
    this.rows.push(structuredClone(client));
    // Demo admin only. Production permission/membership must be enforced server-side in C2.
    this.scope.clientIds = [...this.scope.clientIds, client.id];
  }
  list(scope: ClientScope) {
    if (
      scope.organizationId !== this.scope.organizationId ||
      scope.clientIds.some((c) => !this.scope.clientIds.includes(c))
    )
      throw new ScopeError();
    return structuredClone(
      this.rows.filter(
        (c) =>
          c.organizationId === scope.organizationId &&
          scope.clientIds.includes(c.id),
      ),
    );
  }
  get(clientId: string) {
    const c = this.list(this.scope).find((c) => c.id === clientId);
    if (!c) throw new ScopeError();
    return c;
  }
}
export class MockFieldRepository
  extends ScopedMockRepository<CustomFieldDefinition>
  implements FieldRepository
{
  create(clientId: string, input: CustomFieldDefinition) {
    this.check(clientId);
    const f = FieldSchema.parse(input);
    if (
      f.clientId !== clientId ||
      f.organizationId !== this.scope.organizationId
    )
      throw new ScopeError();
    if (
      this.rows.some(
        (r) =>
          r.id === f.id ||
          (r.clientId === clientId && r.stableKey === f.stableKey),
      )
    )
      throw Error("Campo já existe neste catálogo");
    this.rows.push(structuredClone(f));
  }
}
export class MockLeadRepository
  extends ScopedMockRepository<Lead>
  implements LeadRepository
{
  constructor(
    rows: Lead[],
    scope: ClientScope,
    private fields: FieldRepository,
  ) {
    super(rows, scope);
  }
  addTask(clientId: string, id: string, title: string, dueOn: string | null) {
    const r = this.row(clientId, id);
    const task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      dueOn,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    const updated = LeadSchema.parse({
      ...r,
      tasks: [...(r.tasks ?? []), task],
    });
    r.tasks = updated.tasks;
    r.history.push({
      id: crypto.randomUUID(),
      label: `Tarefa criada: ${task.title}`,
      at: task.createdAt,
    });
  }
  toggleTask(clientId: string, id: string, taskId: string) {
    const r = this.row(clientId, id),
      task = r.tasks?.find((t) => t.id === taskId);
    if (!task) throw new ScopeError();
    task.completed = !task.completed;
    r.history.push({
      id: crypto.randomUUID(),
      label: `Tarefa ${task.completed ? "concluída" : "reaberta"}: ${task.title}`,
      at: new Date().toISOString(),
    });
  }
  setStage(clientId: string, id: string, stage: Lead["stage"]) {
    const r = this.row(clientId, id);
    StageSchema.parse(stage);
    if (!r.owner || stage === "new")
      throw Error("Assuma o lead antes de mover.");
    r.stage = stage;
    r.history.push({
      id: crypto.randomUUID(),
      label: `Estágio alterado para ${stage}`,
      at: new Date().toISOString(),
    });
  }
  claim(
    clientId: string,
    id: string,
    calendar: BusinessCalendar = defaultCalendar,
  ) {
    const r = this.row(clientId, id);
    if (r.owner || r.stage !== "new")
      throw Error("Lead já possui responsável ou não está disponível");
    const at = new Date().toISOString(),
      sla = claimSla(r.createdAt, Date.parse(at), calendar);
    r.claimedAt = at;
    r.claimAudit = {
      elapsedBusinessMs: sla.elapsedMs,
      late: sla.overdue,
      targetMinutes: 10,
      calendar: structuredClone(calendar),
    };
    r.owner = "Operadora";
    r.stage = "in_progress";
    r.history.push({
      id: crypto.randomUUID(),
      label: "Atribuição simulada · Operadora DEMO",
      at: new Date().toISOString(),
    });
  }
  editField(clientId: string, id: string, fieldId: string, value: FieldValue) {
    const r = this.row(clientId, id),
      field = this.fields.get(clientId, fieldId),
      v = r.fields.find((f) => f.fieldDefinitionId === fieldId);
    if (!v) throw new ScopeError();
    validateAnswer(field, false, value);
    r.history.push({
      id: crypto.randomUUID(),
      label: `Edição simulada de ${field.label}: ${String(v.value ?? "Não informado")} → ${String(value ?? "Não informado")}`,
      at: new Date().toISOString(),
    });
    v.value = value;
    v.capturedAt = new Date().toISOString();
    v.actor = "Edição humana DEMO";
  }
}
export class MockFormRepository
  extends ScopedMockRepository<FormDefinition>
  implements FormRepository
{
  constructor(
    rows: FormDefinition[],
    scope: ClientScope,
    private fields: FieldRepository,
  ) {
    super(rows, scope);
  }
  save(clientId: string, input: FormDefinition) {
    this.check(clientId);
    const f = FormSchema.parse(input);
    if (
      f.clientId !== clientId ||
      f.organizationId !== this.scope.organizationId
    )
      throw new ScopeError();
    if (this.rows.some((r) => r.slug === f.slug && r.id !== f.id))
      throw Error("Slug já utilizado");
    const ids = new Set<string>();
    for (const v of f.versions) {
      if (
        v.clientId !== clientId ||
        v.formId !== f.id ||
        v.organizationId !== this.scope.organizationId
      )
        throw new ScopeError();
      for (const s of v.steps) {
        this.fields.get(clientId, s.question.fieldDefinitionId);
        for (const id of [s.id, s.question.id, s.actionId, s.backActionId]) {
          if (ids.has(id))
            throw Error("IDs de etapas e ações devem ser distintos");
          ids.add(id);
        }
      }
    }
    if (!f.versions.some((v) => v.id === f.activeVersionId))
      throw Error("Versão ativa ausente");
    const old = this.rows.find((r) => r.id === f.id);
    if (old) {
      this.get(clientId, f.id);
      for (const v of old.versions.filter((v) => v.state === "snapshot")) {
        if (
          JSON.stringify(v) !==
          JSON.stringify(f.versions.find((n) => n.id === v.id))
        )
          throw Error("Snapshot imutável");
      }
      this.rows[this.rows.indexOf(old)] = structuredClone(f);
    } else this.rows.push(structuredClone(f));
  }
  archive(clientId: string, id: string) {
    this.row(clientId, id).status = "archived";
  }
  duplicate(clientId: string, id: string) {
    const original = this.get(clientId, id),
      newId = crypto.randomUUID(),
      v = structuredClone(
        original.versions.find((v) => v.id === original.activeVersionId)!,
      );
    v.id = crypto.randomUUID();
    v.formId = newId;
    v.number = 1;
    v.state = "draft";
    v.steps = v.steps.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
      backActionId: crypto.randomUUID(),
      question: { ...s.question, id: crypto.randomUUID() },
    }));
    this.save(clientId, {
      ...original,
      id: newId,
      name: original.name + " — cópia",
      slug: "demo-" + newId,
      status: "draft",
      activeVersionId: v.id,
      versions: [v],
    });
    return newId;
  }
  snapshot(clientId: string, id: string) {
    const r = this.row(clientId, id),
      v = r.versions.find((v) => v.id === r.activeVersionId)!;
    v.state = "snapshot";
    r.status = "demo";
    return structuredClone(v);
  }
}
export class MockInboxRepository
  extends ScopedMockRepository<Conversation>
  implements InboxRepository
{
  ensure(clientId: string, lead: Lead) {
    this.check(clientId);
    if (
      lead.clientId !== clientId ||
      lead.organizationId !== this.scope.organizationId
    )
      throw new ScopeError();
    const existing = this.list(clientId).find((c) => c.leadId === lead.id);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    this.rows.push({
      id,
      organizationId: lead.organizationId,
      clientId,
      leadId: lead.id,
      name: lead.name,
      owner: lead.owner,
      connection: "disconnected",
      messages: [],
    });
    return id;
  }
}
export class MockAppointmentRepository
  extends ScopedMockRepository<AppointmentMirror>
  implements AppointmentRepository
{
  setAttendance(
    clientId: string,
    id: string,
    status: AppointmentMirror["attendance"],
  ) {
    this.row(clientId, id).attendance = status;
  }
}
export class MockAnalyticsRepository implements AnalyticsRepository {
  constructor(private forms: FormRepository) {}
  get(clientId: string, formId: string, versionId: string) {
    const f = this.forms.get(clientId, formId),
      v = f.versions.find((v) => v.id === versionId);
    if (!v) throw new ScopeError();
    const base = f.slug.endsWith("-demo") && v.number === 1 ? 100 : 0;
    return {
      clientId,
      formId,
      versionId,
      views: base,
      engaged: base ? 72 : 0,
      submissions: base ? 38 : 0,
      abandoned: base ? 62 : 0,
      validationErrors: base ? 8 : 0,
      actions: base ? 310 : 0,
      steps: v.steps.map((s, i) => ({
        stepId: s.id,
        viewed: base ? ([100, 78, 55, 46, 41][i] ?? 38) : 0,
        completed: base ? ([78, 55, 46, 41, 38][i] ?? 38) : 0,
        abandoned: base ? ([22, 23, 9, 5, 3][i] ?? 0) : 0,
      })),
    };
  }
}
export function createMockRepositories(
  scope: ClientScope = structuredClone(fixture.demoScope),
) {
  const fields = new MockFieldRepository(
      structuredClone(fixture.fields),
      scope,
    ),
    forms = new MockFormRepository(
      structuredClone(fixture.forms),
      scope,
      fields,
    );
  const leadRows = structuredClone(fixture.leads);
  const clients = new MockClientRepository(scope);
  return {
    capture: new MemoryCaptureRepository(scope, forms, fields, leadRows),
    clients,
    investments: new MemoryInvestments(clients),
    fields,
    forms,
    leads: new MockLeadRepository(leadRows, scope, fields),
    inbox: new MockInboxRepository(
      structuredClone(fixture.conversations),
      scope,
    ),
    appointments: new MockAppointmentRepository(
      structuredClone(fixture.appointments),
      scope,
    ),
    analytics: new MockAnalyticsRepository(forms),
  };
}
export type DemoRepositories = ReturnType<typeof createMockRepositories>;
