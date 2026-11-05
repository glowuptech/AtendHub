import type { RepositoryRegistry, ClientScope } from "@/domain/contracts";
import type { Lead, Conversation } from "@/domain/schemas";
import type { WebhookConfig } from "@/features/webhooks/config";
import { localDay, shiftDay } from "@/features/clients/services/overview";
import { type BusinessCalendar } from "@/features/queue/calendar";
import {
  CadenceSchema,
  PreferencesSchema,
  RuleSettingsSchema,
  defaultRules,
  emptyCadence,
  emptyPreferences,
  ruleDefinitions,
  type RuleId,
  type RuleSettings,
  type Cadence,
  type Preferences,
  type Step,
} from "./config";
type Repos = Omit<RepositoryRegistry, "automations">;
function acceptedMessageKey(m: Conversation["messages"][number]) {
  return m.direction === "inbound" && m.status === "received"
    ? `message:${m.id}:received`
    : m.direction === "outbound" &&
        ["sent", "delivered", "read"].includes(m.status)
      ? `message:${m.id}:sent`
      : null;
}
export type Job = {
  id: string;
  key: string;
  clientId: string;
  organizationId: string;
  leadId: string;
  appointmentId?: string;
  conversationId?: string;
  kind: "followup" | "reminder";
  channel: "whatsapp" | "sms";
  stepId: string;
  stepIndex: number;
  version: number;
  anchor: string;
  dueAt: string;
  status: "scheduled" | "blocked" | "queued" | "sent" | "cancelled" | "failed";
  reason: string;
  text: string;
  sentAt?: string;
};
export type Dispatch = {
  schemaVersion: 1;
  id: string;
  eventType:
    | "followup.send_requested"
    | "appointment.reminder.send_requested"
    | "automation.stage_changed";
  organizationId: string;
  clientId: string;
  operation: "healthcare" | "legal";
  leadId: string;
  jobId?: string;
  appointmentId?: string;
  conversationId?: string;
  channel?: "whatsapp" | "sms";
  stepId?: string;
  version?: number;
  dedupeKey: string;
  occurredAt: string;
  targetStage?: string;
};
export function workingTime(at: number, calendar: BusinessCalendar) {
  for (let i = 0; i < 370; i++) {
    const day = shiftDay(localDay(new Date(at).toISOString()), i),
      weekday = new Date(day + "T12:00:00Z").getUTCDay();
    if (!calendar.days.includes(weekday) || calendar.holidays.includes(day))
      continue;
    const start = Date.parse(`${day}T${calendar.start}:00-03:00`),
      end = Date.parse(`${day}T${calendar.end}:00-03:00`);
    const next = Math.max(at, start);
    if (next < end) return next;
  }
  return null;
}
export class MemoryAutomations {
  private rules = defaultRules();
  private configs = new Map<string, { value: Cadence; version: number }>();
  private preferences = new Map<string, Preferences>();
  private jobs: Job[] = [];
  private dispatches: Dispatch[] = [];
  private seen = new Set<string>();
  private statuses = new Map<string, string>();
  private logs: {
    id: string;
    clientId: string;
    leadId: string;
    at: string;
    message: string;
  }[] = [];
  constructor(
    private scope: ClientScope,
    private r: Repos,
  ) {
    for (const client of r.clients.list(scope)) {
      for (const c of r.inbox.list(client.id))
        for (const m of c.messages) {
          const key = acceptedMessageKey(m);
          if (key) this.seen.add(key);
        }
      for (const a of r.appointments.list(client.id))
        this.statuses.set(a.id, a.status ?? "unknown");
    }
  }
  private client(id: string) {
    if (!this.scope.clientIds.includes(id))
      throw Error("Cliente fora do escopo.");
    return this.r.clients.get(id);
  }
  getRules() {
    return structuredClone(this.rules);
  }
  saveRules(value: RuleSettings) {
    const next = RuleSettingsSchema.parse(value);
    for (const def of ruleDefinitions)
      if (next[def.id] && !this.rules[def.id])
        for (const client of this.r.clients.list(this.scope)) {
          if (def.id === "booked")
            for (const event of this.r.schedule.outbox(client.id))
              this.seen.add(`rule:${event.id}:booked`);
          if (def.id === "inbound" || def.id === "outbound")
            for (const c of this.r.inbox.list(client.id))
              for (const m of c.messages)
                if (
                  acceptedMessageKey(m) &&
                  m.direction ===
                    (def.id === "inbound" ? "inbound" : "outbound")
                )
                  this.seen.add(`rule:${m.id}:${def.id}`);
          if (def.id === "confirmed" || def.id === "rescheduling")
            for (const a of this.r.appointments.list(client.id))
              if (a.status === def.id) this.statuses.set(a.id, a.status);
        }
    this.rules = next;
  }
  getConfig(clientId: string, kind: Job["kind"]) {
    this.client(clientId);
    return structuredClone(
      this.configs.get(`${clientId}:${kind}`) ?? {
        value: emptyCadence(),
        version: 0,
      },
    );
  }
  saveConfig(clientId: string, kind: Job["kind"], raw: Cadence) {
    this.client(clientId);
    const value = CadenceSchema.parse(raw);
    if (
      value.steps.some((s) =>
        kind === "followup"
          ? s.purpose !== "followup"
          : s.purpose === "followup",
      )
    )
      throw Error("Tipo de etapa inválido para esta rotina.");
    if (new Set(value.steps.map((s) => s.id)).size !== value.steps.length)
      throw Error("Etapas duplicadas.");
    const old = this.getConfig(clientId, kind);
    if (JSON.stringify(old.value) === JSON.stringify(value)) return;
    this.configs.set(`${clientId}:${kind}`, {
      value,
      version: old.version + 1,
    });
  }
  getPreferences(clientId: string, leadId: string) {
    this.client(clientId);
    this.r.leads.get(clientId, leadId);
    return structuredClone(
      this.preferences.get(`${clientId}:${leadId}`) ?? emptyPreferences(),
    );
  }
  setPreferences(clientId: string, leadId: string, value: Preferences) {
    this.client(clientId);
    this.r.leads.get(clientId, leadId);
    this.preferences.set(
      `${clientId}:${leadId}`,
      PreferencesSchema.parse(value),
    );
  }
  list(clientId?: string) {
    if (clientId) this.client(clientId);
    return structuredClone(
      this.jobs.filter(
        (job) =>
          this.scope.clientIds.includes(job.clientId) &&
          (!clientId || job.clientId === clientId),
      ),
    );
  }
  outbox(clientId?: string) {
    if (clientId) this.client(clientId);
    return structuredClone(
      this.dispatches.filter(
        (e) =>
          this.scope.clientIds.includes(e.clientId) &&
          (!clientId || e.clientId === clientId) &&
          (!e.jobId ||
            this.jobs.some((j) => j.id === e.jobId && j.status === "queued")),
      ),
    );
  }
  history() {
    return structuredClone(this.logs);
  }
  private transition(
    clientId: string,
    leadId: string,
    rule: RuleId,
    eventId: string,
    now: number,
  ) {
    const key = `rule:${eventId}:${rule}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (!this.rules[rule] || this.client(clientId).status !== "active") return;
    const lead = this.r.leads.get(clientId, leadId),
      pref = this.getPreferences(clientId, leadId),
      def = ruleDefinitions.find((d) => d.id === rule)!;
    if (pref.paused) return;
    if (!(def.from as readonly string[]).includes(lead.stage)) return;
    if (!lead.owner) {
      this.logs.push({
        id: crypto.randomUUID(),
        clientId,
        leadId,
        at: new Date(now).toISOString(),
        message: "Movimentação bloqueada: lead sem responsável.",
      });
      return;
    }
    this.r.leads.setStage(clientId, leadId, def.target);
    this.logs.push({
      id: crypto.randomUUID(),
      clientId,
      leadId,
      at: new Date(now).toISOString(),
      message: def.title,
    });
    this.dispatches.push({
      id: crypto.randomUUID(),
      eventType: "automation.stage_changed",
      schemaVersion: 1,
      organizationId: this.scope.organizationId,
      clientId,
      operation: this.client(clientId).vertical,
      leadId,
      dedupeKey: key,
      occurredAt: new Date(now).toISOString(),
      targetStage: def.target,
    });
  }
  private render(text: string, lead: Lead, appointmentId?: string) {
    const client = this.client(lead.clientId),
      a = appointmentId
        ? this.r.appointments.get(client.id, appointmentId)
        : null,
      doctor = client.doctors.find(
        (d) => d.id === (a ? this.r.schedule.doctorId(a) : lead.doctorId),
      );
    const vars: Record<string, string> = {
      nome: lead.name,
      cliente: client.name,
      profissional: doctor?.name ?? "",
      data: a ? localDay(a.scheduledAt).split("-").reverse().join("/") : "",
      horario: a
        ? new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(a.scheduledAt))
        : "",
    };
    return text.replace(/\{([^{}]+)\}/g, (_, key) => vars[key] ?? "");
  }
  reconcile(
    calendar: BusinessCalendar,
    webhooks: WebhookConfig,
    now = Date.now(),
  ) {
    const eligible = new Set<string>();
    for (const client of this.r.clients.list(this.scope)) {
      for (const event of this.r.schedule.outbox(client.id))
        this.transition(client.id, event.leadId, "booked", event.id, now);
      const appointments = this.r.appointments.list(client.id),
        conversations = this.r.inbox.list(client.id);
      for (const a of appointments) {
        const status = a.status ?? "unknown",
          old = this.statuses.get(a.id);
        if (old !== undefined && old !== status) {
          if (status === "confirmed" || status === "rescheduling")
            this.transition(
              client.id,
              a.leadId,
              status,
              `${a.id}:${old}:${status}:${now}`,
              now,
            );
        }
        this.statuses.set(a.id, status);
      }
      for (const c of conversations) {
        const last = [...c.messages]
          .sort((a, b) => a.at.localeCompare(b.at))
          .at(-1);
        for (const m of c.messages) {
          const key = acceptedMessageKey(m);
          if (!key || this.seen.has(key)) continue;
          this.seen.add(key);
          if (m.id !== last?.id || m.automationJobId) continue;
          if (m.direction === "inbound" && m.status === "received")
            this.transition(client.id, c.leadId, "inbound", m.id, now);
          if (
            m.direction === "outbound" &&
            ["sent", "delivered", "read"].includes(m.status)
          )
            this.transition(client.id, c.leadId, "outbound", m.id, now);
        }
      }
      if (client.status !== "active") continue;
      for (const lead of this.r.leads.list(client.id)) {
        const pref = this.getPreferences(client.id, lead.id),
          cfg = this.getConfig(client.id, "followup");
        const c = conversations
          .filter((c) => c.leadId === lead.id)
          .sort((a, b) =>
            (
              b.messages
                .map((m) => m.at)
                .sort()
                .at(-1) ?? ""
            ).localeCompare(
              a.messages
                .map((m) => m.at)
                .sort()
                .at(-1) ?? "",
            ),
          )[0];
        if (pref.optOut || pref.paused) continue;
        const chronological = c
          ? [...c.messages].sort((a, b) => a.at.localeCompare(b.at))
          : [];
        const latest = chronological.at(-1);
        const last =
          latest?.direction === "outbound"
            ? chronological
                .filter((m) => m.direction === "outbound" && !m.automationJobId)
                .at(-1)
            : undefined;
        if (
          cfg.value.enabled &&
          lead.owner &&
          lead.stage === "waiting" &&
          last?.direction === "outbound" &&
          !chronological.some(
            (m) => m.direction === "inbound" && m.at >= last.at,
          ) &&
          ["sent", "delivered", "read"].includes(last.status) &&
          !appointments.some(
            (a) => a.leadId === lead.id && a.scheduledAt >= last.at,
          )
        ) {
          let anchor = last.at;
          for (let i = 0; i < cfg.value.steps.length; i++) {
            const step = cfg.value.steps[i],
              prior = this.jobs.filter(
                (j) =>
                  j.clientId === client.id &&
                  j.leadId === lead.id &&
                  j.kind === "followup" &&
                  j.anchor === last.id &&
                  j.stepId === step.id,
              );
            const sent = prior.filter((j) => j.status === "sent");
            const channels = (["whatsapp", "sms"] as const).filter(
              (ch) => step[ch],
            );
            if (
              channels.length &&
              channels.every((ch) => sent.some((j) => j.channel === ch))
            ) {
              anchor = sent
                .map((j) => j.sentAt!)
                .sort()
                .at(-1)!;
              continue;
            }
            for (const channel of channels.filter(
              (ch) => !sent.some((j) => j.channel === ch),
            ))
              this.plan({
                clientId: client.id,
                lead,
                step,
                index: i,
                version: cfg.version,
                anchor: last.id,
                kind: "followup",
                channel,
                due: Date.parse(anchor) + step.minutes * 60000,
                conversationId: c.id,
                pref,
                config: cfg.value,
                calendar,
                webhooks,
                now,
                eligible,
              });
            break;
          }
        }
        const reminders = this.getConfig(client.id, "reminder");
        if (!reminders.value.enabled) continue;
        for (const a of appointments.filter(
          (a) =>
            a.leadId === lead.id &&
            a.attendance === "unknown" &&
            a.status !== "rescheduling" &&
            Date.parse(a.scheduledAt) > now,
        ))
          for (let i = 0; i < reminders.value.steps.length; i++) {
            const step = reminders.value.steps[i];
            if (step.purpose === "confirmation" && a.status === "confirmed")
              continue;
            for (const channel of (["whatsapp", "sms"] as const).filter(
              (ch) => step[ch],
            ))
              this.plan({
                clientId: client.id,
                lead,
                step,
                index: i,
                version: reminders.version,
                anchor: a.scheduledAt,
                kind: "reminder",
                channel,
                due: Date.parse(a.scheduledAt) - step.minutes * 60000,
                appointmentId: a.id,
                pref,
                config: reminders.value,
                calendar,
                webhooks,
                now,
                eligible,
              });
          }
      }
    }
    for (const job of this.jobs)
      if (
        !eligible.has(job.key) &&
        !["sent", "cancelled"].includes(job.status)
      ) {
        job.status = "cancelled";
        job.reason =
          "Rotina pausada, versão alterada ou contato/agendamento deixou de ser elegível.";
      }
  }
  private plan(p: {
    clientId: string;
    lead: Lead;
    step: Step;
    index: number;
    version: number;
    anchor: string;
    kind: Job["kind"];
    channel: Job["channel"];
    due: number;
    appointmentId?: string;
    conversationId?: string;
    pref: Preferences;
    config: Cadence;
    calendar: BusinessCalendar;
    webhooks: WebhookConfig;
    now: number;
    eligible: Set<string>;
  }) {
    const key = [
      p.clientId,
      p.lead.id,
      p.kind,
      p.appointmentId ?? p.conversationId,
      p.anchor,
      p.step.id,
      p.channel,
      p.version,
    ].join(":");
    p.eligible.add(key);
    let job = this.jobs.find((j) => j.key === key);
    if (
      job?.status === "sent" ||
      job?.status === "cancelled" ||
      job?.status === "failed"
    )
      return;
    const calendar = p.config.window ?? p.calendar;
    let due = p.config.businessHours ? workingTime(p.due, calendar) : p.due;
    let reason = "";
    const phone = p.lead.contact?.phone?.trim();
    if (p.pref.optOut) reason = "Contato não deseja receber automações.";
    else if (p.pref.paused) reason = "Automações pausadas para este lead.";
    else if (!p.pref[p.channel])
      reason = "Canal sem autorização/preferência registrada.";
    else if (!phone) reason = "Telefone não informado.";
    else if (
      !/^\+?[\d\s().-]+$/.test(phone) ||
      phone.replace(/\D/g, "").length < 10 ||
      phone.replace(/\D/g, "").length > 15
    )
      reason = "Telefone inválido para o canal.";
    else if (
      p.kind === "followup" &&
      /\{(data|horario)\}/.test(
        p.step[p.channel === "whatsapp" ? "whatsappText" : "smsText"],
      )
    )
      reason = "Variáveis de agendamento indisponíveis no follow-up.";
    const url =
      p.kind === "followup" ? p.webhooks.followups : p.webhooks.reminders;
    if (!reason && !url) reason = "Destino de webhook não configurado.";
    if (due === null) reason = "Sem janela útil disponível.";
    if (
      p.appointmentId &&
      due !== null &&
      due >=
        Date.parse(
          this.r.appointments.get(p.clientId, p.appointmentId).scheduledAt,
        )
    )
      reason = "Janela útil ultrapassa o horário do agendamento.";
    if (due !== null && due <= p.now && p.config.businessHours) {
      const current = workingTime(p.now, calendar);
      if (current !== p.now) {
        due = current;
        if (current === null) reason = "Sem janela útil disponível.";
        if (
          p.appointmentId &&
          current !== null &&
          current >=
            Date.parse(
              this.r.appointments.get(p.clientId, p.appointmentId).scheduledAt,
            )
        )
          reason = "Próxima janela útil ultrapassa o agendamento.";
      }
    }
    const rawText =
      p.channel === "whatsapp" ? p.step.whatsappText : p.step.smsText;
    if (rawText.includes("{nome}") && !p.lead.name.trim())
      reason = "Nome não informado para a variável da mensagem.";
    if (rawText.includes("{profissional}")) {
      const client = this.client(p.clientId),
        a = p.appointmentId
          ? this.r.appointments.get(p.clientId, p.appointmentId)
          : null;
      if (
        !client.doctors.some(
          (d) => d.id === (a ? this.r.schedule.doctorId(a) : p.lead.doctorId),
        )
      )
        reason = "Profissional não vinculado para a variável da mensagem.";
    }
    const text = this.render(
      p.channel === "whatsapp" ? p.step.whatsappText : p.step.smsText,
      p.lead,
      p.appointmentId,
    );
    const missed = !job && p.kind === "reminder" && p.due < p.now;
    if (!job) {
      job = {
        id: crypto.randomUUID(),
        key,
        clientId: p.clientId,
        organizationId: this.scope.organizationId,
        leadId: p.lead.id,
        appointmentId: p.appointmentId,
        conversationId: p.conversationId,
        kind: p.kind,
        channel: p.channel,
        stepId: p.step.id,
        stepIndex: p.index,
        version: p.version,
        anchor: p.anchor,
        dueAt: new Date(due ?? p.due).toISOString(),
        status: "scheduled",
        reason: "",
        text,
      };
      this.jobs.push(job);
    }
    if (missed) {
      job.status = "cancelled";
      job.reason = "Antecedência já passou ao ativar esta programação.";
      return;
    }
    job.text = text;
    job.dueAt = new Date(due ?? p.due).toISOString();
    job.reason = reason;
    if (reason) {
      job.status = "blocked";
      return;
    }
    if (due! > p.now) {
      job.status = "scheduled";
      return;
    }
    if (job.status === "queued" || job.status === "failed") return;
    job.status = "queued";
    if (this.dispatches.some((e) => e.jobId === job.id)) return;
    this.dispatches.push({
      id: crypto.randomUUID(),
      schemaVersion: 1,
      eventType:
        p.kind === "followup"
          ? "followup.send_requested"
          : "appointment.reminder.send_requested",
      organizationId: this.scope.organizationId,
      clientId: p.clientId,
      operation: this.client(p.clientId).vertical,
      leadId: p.lead.id,
      jobId: job.id,
      appointmentId: p.appointmentId,
      conversationId: p.conversationId,
      channel: p.channel,
      stepId: p.step.id,
      version: p.version,
      dedupeKey: key,
      occurredAt: new Date(p.now).toISOString(),
    });
  }
  // Called only by a future authenticated worker, never exposed as a browser action.
  recordResult(
    clientId: string,
    id: string,
    result: "sent" | "failed",
    at = new Date().toISOString(),
  ) {
    this.client(clientId);
    if (!Number.isFinite(Date.parse(at)))
      throw Error("Data de resultado inválida.");
    const job = this.jobs.find((j) => j.id === id && j.clientId === clientId);
    if (!job) throw Error("Tarefa fora do escopo.");
    if (job.status === "sent") return;
    if (job.status !== "queued")
      throw Error("Tarefa não está aguardando resultado.");
    job.status = result;
    job.reason =
      result === "failed"
        ? "Falha informada pelo provedor; revisão necessária."
        : "";
    if (result === "sent") job.sentAt = at;
  }
}
