import type {
  ClientScope,
  FormRepository,
  FieldRepository,
} from "@/domain/contracts";
import {
  LeadSchema,
  validateAnswer,
  type Lead,
  type FieldValue,
} from "@/domain/schemas";
import { settingsOf } from "./settings";
export interface CaptureInput {
  clientId: string;
  formId: string;
  versionId: string;
  sessionId: string;
  contacts: { name: string; phone: string; email: string };
  answers: Record<string, FieldValue>;
  complete: boolean;
  nextIndex?: number;
}
export interface CaptureEvent {
  id: string;
  schemaVersion: 1;
  organizationId: string;
  clientId: string;
  formId: string;
  versionId: string;
  leadId: string;
  eventType: "lead.completed" | "lead.incomplete";
  occurredAt: string;
  status: "pending";
  attempts: number;
  nextAttemptAt: string;
}
interface Session {
  input: CaptureInput;
  leadId: string;
  lastActivity: number;
  completed: boolean;
  incompleteSent: boolean;
}
export class MemoryCaptureRepository {
  private sessions = new Map<string, Session>();
  private outbox: CaptureEvent[] = [];
  private views = new Map<
    string,
    { clientId: string; formId: string; versionId: string; at: string }
  >();
  private marketing: {
    eventId: string;
    clientId: string;
    formId: string;
    pixelId: string;
    eventName: string;
    actionId?: string;
  }[] = [];
  private events: {
    clientId: string;
    formId: string;
    sessionId: string;
    actionId: string;
    eventName: string;
    eventId: string;
  }[] = [];
  constructor(
    private scope: ClientScope,
    private forms: FormRepository,
    private fields: FieldRepository,
    private leads: Lead[],
  ) {}
  private context(
    input: Pick<CaptureInput, "clientId" | "formId" | "versionId">,
  ) {
    const f = this.forms.get(input.clientId, input.formId);
    const v = f.versions.find((v) => v.id === input.versionId);
    if (
      !v ||
      v.state !== "snapshot" ||
      f.status === "archived" ||
      !settingsOf(v.settings).enabled
    )
      throw Error("Formulário indisponível");
    return { f, v, settings: settingsOf(v.settings) };
  }
  view(
    input: Pick<
      CaptureInput,
      "clientId" | "formId" | "versionId" | "sessionId"
    >,
  ) {
    const { settings } = this.context(input);
    if (this.views.has(`${input.formId}:${input.sessionId}`)) return;
    if (settings.tracking.pixelId && settings.tracking.pageView)
      this.marketing.push({
        eventId: crypto.randomUUID(),
        clientId: input.clientId,
        formId: input.formId,
        pixelId: settings.tracking.pixelId,
        eventName: "PageView",
      });
    this.views.set(`${input.formId}:${input.sessionId}`, {
      clientId: input.clientId,
      formId: input.formId,
      versionId: input.versionId,
      at: new Date().toISOString(),
    });
  }
  action(
    input: Pick<
      CaptureInput,
      "clientId" | "formId" | "versionId" | "sessionId"
    >,
    actionId: string,
  ) {
    const { v, settings } = this.context(input);
    const step = v.steps.find((s) => s.actionId === actionId);
    if (!step) throw Error("Etapa inválida");
    if (
      !this.events.some(
        (e) =>
          e.formId === input.formId &&
          e.sessionId === input.sessionId &&
          e.actionId === actionId,
      )
    ) {
      const eventId = crypto.randomUUID();
      this.events.push({
        clientId: input.clientId,
        formId: input.formId,
        sessionId: input.sessionId,
        actionId,
        eventName: step.metaEvent || "StepCompleted",
        eventId,
      });
      if (settings.tracking.pixelId && step.metaEvent)
        this.marketing.push({
          eventId,
          clientId: input.clientId,
          formId: input.formId,
          pixelId: settings.tracking.pixelId,
          eventName: step.metaEvent,
          actionId,
        });
    }
  }
  capture(input: CaptureInput, now = Date.now()) {
    const { f, v, settings } = this.context(input);
    if (!input.sessionId || input.sessionId.length > 100)
      throw Error("Sessão inválida");
    const key = `${f.id}:${input.sessionId}`;
    const previous = this.sessions.get(key);
    if (previous && previous.input.versionId !== input.versionId)
      throw Error("A versão desta sessão mudou");
    if (previous?.completed) return previous.leadId;
    for (const [key, config] of Object.entries(settings.contacts)) {
      const value =
        input.contacts[key as keyof typeof input.contacts]?.trim() ?? "";
      if (config.enabled && config.required && !value)
        throw Error(`Preencha ${config.label}`);
      if (
        config.enabled &&
        value &&
        key === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        throw Error("E-mail inválido");
      if (
        config.enabled &&
        value &&
        key === "phone" &&
        !/^\+?[\d ()-]{8,25}$/.test(value)
      )
        throw Error("Telefone inválido");
      if (value.length > 200) throw Error("Contato muito longo");
    }
    const contact = { ...input.contacts };
    for (const k of ["name", "phone", "email"] as const)
      if (!settings.contacts[k].enabled) contact[k] = "";
    if (
      !input.complete &&
      (settings.contactPosition !== "start" ||
        !contact.name.trim() ||
        !contact.phone.trim())
    )
      return null;
    const values = v.steps.flatMap((s) => {
      const answer = input.answers[s.question.id];
      const field = this.fields.get(f.clientId, s.question.fieldDefinitionId);
      if (input.complete || answer !== undefined)
        validateAnswer(field, s.question.required, answer);
      return answer === undefined
        ? []
        : [
            {
              fieldDefinitionId: field.id,
              questionId: s.question.id,
              value: answer,
              submissionId: previous?.leadId ?? "",
              capturedAt: new Date(now).toISOString(),
              actor: "Formulário",
            },
          ];
    });
    const id = previous?.leadId ?? crypto.randomUUID();
    const at = new Date(now).toISOString();
    const old = this.leads.find((l) => l.id === id);
    const lead = LeadSchema.parse({
      ...old,
      id,
      organizationId: f.organizationId,
      clientId: f.clientId,
      doctorId: f.doctorId,
      contactId: old?.contactId ?? crypto.randomUUID(),
      name:
        contact.name ||
        contact.email ||
        contact.phone ||
        "Contato sem identificação",
      contact,
      captureStatus: input.complete ? "completed" : "in_progress",
      stage: old?.stage ?? "new",
      owner: old?.owner ?? null,
      formId: f.id,
      versionId: v.id,
      createdAt: old?.createdAt ?? at,
      minutesSinceContact: 0,
      nextAction: input.complete
        ? "Iniciar atendimento"
        : "Aguardando conclusão do formulário",
      source: f.name,
      fields: values.map((x) => ({ ...x, submissionId: id })),
      history: [
        ...(old?.history ?? []),
        {
          id: crypto.randomUUID(),
          label: input.complete
            ? "Cadastro concluído"
            : "Respostas atualizadas",
          at,
        },
      ],
    });
    if (old) this.leads[this.leads.indexOf(old)] = lead;
    else this.leads.push(lead);
    const session = {
      input: structuredClone({ ...input, contacts: contact }),
      leadId: id,
      lastActivity: now,
      completed: input.complete,
      incompleteSent: previous?.incompleteSent ?? false,
    };
    this.sessions.set(key, session);
    if (input.complete) {
      this.enqueue(session, "lead.completed", now);
      if (settings.tracking.pixelId && settings.tracking.lead)
        this.marketing.push({
          eventId: this.outbox.find(
            (e) => e.leadId === id && e.eventType === "lead.completed",
          )!.id,
          clientId: f.clientId,
          formId: f.id,
          pixelId: settings.tracking.pixelId,
          eventName: "Lead",
        });
    }
    return id;
  }
  private enqueue(
    s: Session,
    eventType: CaptureEvent["eventType"],
    now: number,
  ) {
    if (
      this.outbox.some(
        (e) => e.leadId === s.leadId && e.eventType === eventType,
      )
    )
      return;
    const at = new Date(now).toISOString();
    this.outbox.push({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      organizationId: this.scope.organizationId,
      clientId: s.input.clientId,
      formId: s.input.formId,
      versionId: s.input.versionId,
      leadId: s.leadId,
      eventType,
      occurredAt: at,
      status: "pending",
      attempts: 0,
      nextAttemptAt: at,
    });
  }
  sweep(now = Date.now()) {
    for (const s of this.sessions.values()) {
      if (s.completed) continue;
      const f = this.forms.get(s.input.clientId, s.input.formId);
      const v = f.versions.find((v) => v.id === s.input.versionId)!;
      if (
        now - s.lastActivity <
        settingsOf(v.settings).tracking.abandonMinutes * 60000
      )
        continue;
      const lead = this.leads.find((l) => l.id === s.leadId)!;
      lead.captureStatus = "incomplete";
      lead.nextAction = "Retomar cadastro incompleto";
      if (!s.incompleteSent) this.enqueue(s, "lead.incomplete", now);
      s.incompleteSent = true;
    }
  }
  progress(clientId: string, formId: string, versionId: string) {
    this.forms.get(clientId, formId);
    const session = [...this.sessions.values()].find(
      (s) =>
        s.input.clientId === clientId &&
        s.input.formId === formId &&
        s.input.versionId === versionId &&
        !s.completed,
    );
    return session ? structuredClone(session.input) : null;
  }
  listMarketing(clientId: string) {
    this.forms.list(clientId);
    return structuredClone(
      this.marketing.filter((e) => e.clientId === clientId),
    );
  }
  listEvents(clientId: string) {
    this.forms.list(clientId);
    return structuredClone(this.outbox.filter((e) => e.clientId === clientId));
  }
  listActions(clientId: string) {
    this.forms.list(clientId);
    return structuredClone(this.events.filter((e) => e.clientId === clientId));
  }
  stats(clientId: string, formId: string, versionId?: string) {
    this.forms.get(clientId, formId);
    const views = [...this.views.values()].filter(
      (v) =>
        v.clientId === clientId &&
        v.formId === formId &&
        (!versionId || v.versionId === versionId),
    );
    const sessions = [...this.sessions.values()].filter(
      (s) =>
        s.input.clientId === clientId &&
        s.input.formId === formId &&
        (!versionId || s.input.versionId === versionId),
    );
    return {
      qualifiedCompleted: sessions.filter(
        (s) => s.completed && this.views.has(`${formId}:${s.input.sessionId}`),
      ).length,
      views: views.length,
      completed: sessions.filter((s) => s.completed).length,
      incomplete: sessions.filter(
        (s) =>
          !s.completed &&
          this.leads.find((l) => l.id === s.leadId)?.captureStatus ===
            "incomplete",
      ).length,
      lastView: views.at(-1)?.at ?? null,
    };
  }
}

export type CaptureRepository = Pick<
  MemoryCaptureRepository,
  | "capture"
  | "view"
  | "action"
  | "sweep"
  | "progress"
  | "listMarketing"
  | "listEvents"
  | "listActions"
  | "stats"
>;
