import type {
  Client,
  Lead,
  FormDefinition,
  FormVersion,
  CustomFieldDefinition,
  Conversation,
  AppointmentMirror,
  FormEvent,
  FieldValue,
} from "./schemas";
export interface Organization {
  id: string;
  name: string;
}
export type Role = "admin" | "attendant" | "clinic_user";
export interface User {
  id: string;
  displayName: string;
}
export interface Membership {
  organizationId: string;
  userId: string;
  role: Role;
  active: boolean;
}
export interface ClientScope {
  organizationId: string;
  clientIds: readonly string[];
}
export interface FeatureFlags {
  legal: false;
  marketing: false;
  liveMessaging: false;
  authentication: false;
}
export interface Contact {
  id: string;
  clientId: string;
  organizationId: string;
  name: string;
  phoneE164: string | null;
}
export interface LeadAssignment {
  id: string;
  clientId: string;
  leadId: string;
  ownerId: string;
  assignedAt: string;
  reason: string;
}
export interface FollowupTask {
  id: string;
  clientId: string;
  leadId: string;
  dueAt: string;
  status: "pending" | "completed";
}
export interface LeadFieldChange {
  id: string;
  clientId: string;
  leadId: string;
  fieldId: string;
  before: FieldValue;
  after: FieldValue;
  actor: string;
  at: string;
}
export interface FormSession {
  id: string;
  clientId: string;
  formId: string;
  versionId: string;
  startedAt: string;
  expiresAt: string;
}
export interface FormAttribution {
  source: string;
  campaignRef?: string;
  confidence: "demo" | "declared" | "verified";
}
export interface FormAnswer {
  questionId: string;
  value: FieldValue;
}
export interface FormSubmission {
  id: string;
  clientId: string;
  versionId: string;
  sessionId: string;
  idempotencyKey: string;
  answers: FormAnswer[];
  attribution: FormAttribution;
}
export interface FormTrackingConfig {
  formId: string;
  enabled: false;
  provider: "disabled";
}
export interface OutboxEvent {
  id: string;
  organizationId: string;
  clientId: string;
  aggregateId: string;
  eventType: "form.submitted";
  schemaVersion: 1;
  idempotencyKey: string;
  occurredAt: string;
}
export interface FormAnalyticsSummary {
  clientId: string;
  formId: string;
  versionId: string;
  views: number;
  engaged: number;
  submissions: number;
  abandoned: number;
  validationErrors: number;
  actions: number;
  steps: {
    stepId: string;
    viewed: number;
    completed: number;
    abandoned: number;
  }[];
}
export interface ScopedRepository<T> {
  list(clientId: string): T[];
  get(clientId: string, id: string): T;
}
export interface ClientRepository {
  list(scope: ClientScope): Client[];
  get(clientId: string): Client;
}
export interface LeadRepository extends ScopedRepository<Lead> {
  claim(clientId: string, id: string): void;
  editField(
    clientId: string,
    id: string,
    fieldId: string,
    value: FieldValue,
  ): void;
}
export interface FieldRepository extends ScopedRepository<CustomFieldDefinition> {
  create(clientId: string, field: CustomFieldDefinition): void;
}
export interface FormRepository extends ScopedRepository<FormDefinition> {
  save(clientId: string, form: FormDefinition): void;
  duplicate(clientId: string, id: string): string;
  archive(clientId: string, id: string): void;
  snapshot(clientId: string, id: string): FormVersion;
}
export type InboxRepository = ScopedRepository<Conversation>;
export interface AppointmentRepository extends ScopedRepository<AppointmentMirror> {
  setAttendance(
    clientId: string,
    id: string,
    status: AppointmentMirror["attendance"],
  ): void;
}
export interface AnalyticsRepository {
  get(
    clientId: string,
    formId: string,
    versionId: string,
  ): FormAnalyticsSummary;
}
export interface InternalFormEventRecorder {
  record(event: FormEvent): void;
  list(sessionId: string): readonly FormEvent[];
  clear(sessionId: string): void;
}
export interface MarketingEventProvider {
  readonly enabled: false;
  record(event: FormEvent): void;
}

/** UI-facing query/cache facade. C2 adapters load authenticated DTOs asynchronously. */
export interface RepositoryRegistry {
  clients: ClientRepository;
  fields: FieldRepository;
  forms: FormRepository;
  leads: LeadRepository;
  inbox: InboxRepository;
  appointments: AppointmentRepository;
  analytics: AnalyticsRepository;
}
