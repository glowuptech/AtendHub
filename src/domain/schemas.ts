import { z } from "zod";
import { BillingSchema } from "./billing";
import { FormSettingsSchema } from "@/features/forms/services/settings";
z.config(z.locales.pt());
export const Id = z.string().uuid();
export const scoped = { id: Id, organizationId: Id, clientId: Id };
export const RoleSchema = z.enum(["admin", "attendant", "clinic_user"]);
export const DoctorSchema = z.object({
  id: Id,
  name: z.string().trim().min(2).max(120),
  crm: z
    .string()
    .regex(/^\d{1,8}$/, "CRM deve conter de 1 a 8 dígitos")
    .nullable(),
  uf: z.enum([
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ]),
  specialties: z.array(z.string().trim().min(2).max(80)).max(20),
});
export const PartnershipSchema = z
  .object({
    projectStartedOn: z.string().date().nullable().default(null),
    signedOn: z.string().date().nullable().default(null),
    signatureDueOn: z.string().date().nullable().default(null),
    renewsOn: z.string().date().nullable().default(null),
    manager: z.string().max(120).default(""),
    notes: z.string().max(1500).default(""),
  })
  .superRefine((v, ctx) => {
    if (
      v.renewsOn &&
      ((v.signedOn && v.renewsOn <= v.signedOn) ||
        (v.projectStartedOn && v.renewsOn <= v.projectStartedOn))
    )
      ctx.addIssue({
        code: "custom",
        path: ["renewsOn"],
        message:
          "A renovação deve ser posterior à assinatura e ao início do projeto.",
      });
  });
export const AddressSchema = z.object({
  postalCode: z
    .string()
    .regex(/^(\d{8})?$/, "CEP deve ter 8 dígitos")
    .default(""),
  street: z.string().max(150).default(""),
  number: z.string().max(20).default(""),
  complement: z.string().max(100).default(""),
  neighborhood: z.string().max(100).default(""),
  city: z.string().max(100).default(""),
  state: z.union([DoctorSchema.shape.uf, z.literal("")]).default(""),
});
export const KnowledgeEntrySchema = z
  .object({
    id: z.string().min(1),
    category: z.string().trim().min(1).max(100),
    question: z.string().trim().min(3).max(300),
    answer: z.string().trim().max(6000),
    source: z.string().trim().max(500),
    status: z.enum(["draft", "pending", "approved"]),
    updatedAt: z.string().datetime().nullable(),
    priceCents: z.number().int().nonnegative().nullable(),
    currency: z.literal("BRL"),
    conditions: z.string().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "approved" && (!v.answer || !v.source))
      ctx.addIssue({
        code: "custom",
        message: "Para aprovar, preencha resposta e fonte.",
      });
  });
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
export const ClientSchema = z.object({
  billing: BillingSchema.optional(),
  knowledge: z.array(KnowledgeEntrySchema).default([]),
  id: Id,
  organizationId: Id,
  name: z.string().trim().min(2).max(120),
  vertical: z.enum(["healthcare", "legal"]),
  status: z.enum(["active", "paused"]),
  branding: z.enum(["prescrita", "sage"]),
  externalSchedulingUrl: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:", "A agenda deve usar HTTPS"),
  description: z.string(),
  category: z
    .enum(["clinic", "doctor_male", "doctor_female"])
    .default("clinic"),
  cnpj: z
    .string()
    .regex(/^\d{14}$/, "Informe os 14 dígitos do CNPJ demonstrativo")
    .nullable()
    .default(null),
  logo: z
    .string()
    .max(1500000)
    .refine(
      (v) =>
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
        ["/logos/ana-demo.svg", "/logos/horizonte-demo.svg"].includes(v),
      "Formato de logotipo inválido",
    )
    .nullable()
    .default(null),
  specialties: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
  doctors: z.array(DoctorSchema).max(20).default([]),
  address: AddressSchema.prefault({}),
  partnership: PartnershipSchema.prefault({}),
  contactName: z.string().max(120).default(""),
  contactPhone: z.string().max(30).default(""),
  contactEmail: z.union([z.string().email(), z.literal("")]).default(""),
});
export const FieldTypeSchema = z.enum([
  "short_text",
  "long_text",
  "phone",
  "email",
  "single_select",
  "multi_select",
  "date",
  "boolean",
  "consent",
]);
export const reservedFields = [
  "id",
  "organization_id",
  "client_id",
  "lead_id",
  "contact_id",
  "status",
  "owner_id",
  "tenant_id",
  "provider_id",
];
export const FieldSchema = z
  .object({
    ...scoped,
    stableKey: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .refine((v) => !reservedFields.includes(v), "Chave reservada do sistema"),
    label: z.string().trim().min(2).max(100),
    type: FieldTypeSchema,
    sensitivity: z.literal("ordinary"),
    options: z
      .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
      .max(20),
  })
  .superRefine((v, ctx) => {
    if (["single_select", "multi_select"].includes(v.type) && !v.options.length)
      ctx.addIssue({
        code: "custom",
        message: "Informe opções para este campo",
        path: ["options"],
      });
    if (new Set(v.options.map((o) => o.id)).size !== v.options.length)
      ctx.addIssue({ code: "custom", message: "Opções duplicadas" });
  });
export const QuestionSchema = z.object({
  id: Id,
  fieldDefinitionId: Id,
  label: z.string().min(2),
  required: z.boolean(),
});
export const StepSchema = z.object({
  metaEvent: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$|^$/)
    .optional(),
  id: Id,
  order: z.number().int().nonnegative(),
  title: z.string().min(2),
  description: z.string(),
  buttonLabel: z.string().min(1),
  actionId: Id,
  backActionId: Id,
  question: QuestionSchema,
});
export const VersionSchema = z.object({
  settings: FormSettingsSchema.optional(),
  ...scoped,
  formId: Id,
  number: z.number().int().positive(),
  state: z.enum(["draft", "snapshot"]),
  steps: z.array(StepSchema).min(1),
  theme: z.enum(["prescrita", "sage"]),
  successMessage: z.string().min(2),
  destination: z.literal("demo_success"),
});
export const FormSchema = z.object({
  doctorId: Id.nullable().default(null),
  ...scoped,
  name: z.string().trim().min(3),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "demo", "archived"]),
  activeVersionId: Id,
  versions: z.array(VersionSchema).min(1),
});
export const ValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export const StageSchema = z.enum([
  "new",
  "in_progress",
  "waiting",
  "scheduled",
  "awaiting_scheduling",
  "confirmed",
  "rescheduling",
  "recovery",
  "lost",
]);
export const LeadSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: Id,
        title: z.string().trim().min(2).max(200),
        dueOn: z.iso.date().nullable(),
        completed: z.boolean(),
        createdAt: z.string().datetime(),
      }),
    )
    .optional(),
  claimedAt: z.string().datetime().optional(),
  claimAudit: z
    .object({
      elapsedBusinessMs: z.number(),
      late: z.boolean(),
      targetMinutes: z.literal(10),
      calendar: z.object({
        start: z.string(),
        end: z.string(),
        days: z.array(z.number()),
        holidays: z.array(z.string()),
      }),
    })
    .optional(),
  captureStatus: z.enum(["in_progress", "incomplete", "completed"]).optional(),
  contact: z
    .object({ name: z.string(), phone: z.string(), email: z.string() })
    .optional(),
  doctorId: Id.nullable().default(null),
  firstResponseAt: z.string().datetime().nullable().default(null),
  handlingMinutes: z.number().nonnegative().nullable().default(null),
  ...scoped,
  contactId: Id,
  name: z.string(),
  stage: StageSchema,
  owner: z.string().nullable(),
  formId: Id,
  versionId: Id,
  createdAt: z.string().datetime(),
  minutesSinceContact: z.number(),
  nextAction: z.string(),
  source: z.string(),
  fields: z.array(
    z.object({
      fieldDefinitionId: Id,
      value: ValueSchema,
      questionId: Id,
      submissionId: Id,
      capturedAt: z.string().datetime(),
      actor: z.string(),
    }),
  ),
  history: z.array(
    z.object({ id: Id, label: z.string(), at: z.string().datetime() }),
  ),
});
export const AppointmentSchema = z.object({
  status: z
    .enum(["awaiting_confirmation", "confirmed", "rescheduling"])
    .optional(),
  doctorId: Id.nullable().optional(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  ...scoped,
  leadId: Id,
  name: z.string(),
  scheduledAt: z.string().datetime(),
  source: z.literal("Registro manual"),
  attendance: z.enum(["unknown", "present", "absent"]),
});
export const ConversationSchema = z.object({
  photoUrl: z
    .string()
    .url()
    .max(2000)
    .refine((value) => value.startsWith("https://"), "A foto deve usar HTTPS")
    .optional(),
  ...scoped,
  leadId: Id,
  name: z.string(),
  owner: z.string().nullable(),
  connection: z.literal("disconnected"),
  messages: z.array(
    z.object({
      id: Id,
      direction: z.enum(["inbound", "outbound"]),
      body: z.string(),
      at: z.string().datetime(),
      status: z.literal("simulated"),
    }),
  ),
});
export const EventSchema = z
  .object({
    eventId: Id,
    formId: Id,
    versionId: Id,
    sessionId: Id,
    stepId: Id.optional(),
    actionId: Id.optional(),
    eventType: z.enum([
      "form_view",
      "engaged_10s",
      "step_view",
      "step_completed",
      "action_clicked",
      "form_submitted",
      "form_abandoned",
      "form_validation_failed",
    ]),
    elapsedVisibleMs: z.number().nonnegative().optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type Client = z.infer<typeof ClientSchema>;
export type CustomFieldDefinition = z.infer<typeof FieldSchema>;
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type FormDefinition = z.infer<typeof FormSchema>;
export type FormVersion = z.infer<typeof VersionSchema>;
export type FormStep = z.infer<typeof StepSchema>;
export type FormQuestion = z.infer<typeof QuestionSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type LeadStage = z.infer<typeof StageSchema>;
export type FieldValue = z.infer<typeof ValueSchema>;
export type AppointmentMirror = z.infer<typeof AppointmentSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type FormEvent = z.infer<typeof EventSchema>;
export function validateAnswer(
  field: CustomFieldDefinition,
  required: boolean,
  value: unknown,
) {
  if (
    !required &&
    (value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0))
  )
    return ValueSchema.nullable().parse(value ?? null);
  switch (field.type) {
    case "phone":
      return z
        .string()
        .regex(
          /^\+[1-9]\d{7,14}$/,
          "Use telefone no formato +5511999999999 (apenas fictício)",
        )
        .parse(value);
    case "email":
      return z
        .string()
        .email("Informe um e-mail válido de demonstração")
        .parse(value);
    case "date":
      return z.string().date("Informe uma data válida").parse(value);
    case "consent":
      return z
        .literal(true, { error: "Marque o aceite para continuar" })
        .parse(value);
    case "boolean":
      return z.boolean().parse(value);
    case "single_select":
      return z
        .string()
        .refine(
          (v) => field.options.some((o) => o.id === v),
          "Escolha uma opção",
        )
        .parse(value);
    case "multi_select":
      return z
        .array(z.string())
        .min(required ? 1 : 0)
        .max(field.options.length)
        .refine(
          (v) =>
            new Set(v).size === v.length &&
            v.every((i) => field.options.some((o) => o.id === i)),
          "Selecione opções válidas",
        )
        .parse(value);
    default:
      return z
        .string()
        .trim()
        .min(required ? 1 : 0, "Preencha este campo")
        .max(field.type === "long_text" ? 1000 : 150)
        .parse(value);
  }
}
