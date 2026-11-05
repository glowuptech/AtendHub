import { z } from "zod";
import { CalendarSchema } from "@/features/queue/calendar";
export const ruleDefinitions = [
  {
    id: "outbound",
    title: "Mensagem enviada → Aguardando resposta",
    description:
      "Somente após envio aceito pelo provedor; cliques e mensagens locais não contam.",
    from: ["in_progress", "awaiting_scheduling"],
    target: "waiting",
  },
  {
    id: "inbound",
    title: "Resposta recebida → Em atendimento",
    description: "Reabre somente leads aguardando resposta ou em recuperação.",
    from: ["waiting", "recovery"],
    target: "in_progress",
  },
  {
    id: "booked",
    title: "Agendamento criado → Agendado",
    description:
      "Após gravação válida; preserva responsável e não reabre leads perdidos.",
    from: ["in_progress", "waiting", "awaiting_scheduling"],
    target: "scheduled",
  },
  {
    id: "confirmed",
    title: "Confirmação registrada → Agendamento confirmado",
    description:
      "Exige confirmação explícita no agendamento. Texto livre não confirma consulta.",
    from: ["scheduled"],
    target: "confirmed",
  },
  {
    id: "rescheduling",
    title: "Remarcação registrada → Reagendamento",
    description: "A pendência precisa estar registrada no agendamento.",
    from: ["scheduled", "confirmed"],
    target: "rescheduling",
  },
] as const;
export type RuleId = (typeof ruleDefinitions)[number]["id"];
export const RuleSettingsSchema = z.object({
  outbound: z.boolean(),
  inbound: z.boolean(),
  booked: z.boolean(),
  confirmed: z.boolean(),
  rescheduling: z.boolean(),
});
export const defaultRules = () =>
  RuleSettingsSchema.parse({
    outbound: false,
    inbound: false,
    booked: false,
    confirmed: false,
    rescheduling: false,
  });
export type RuleSettings = z.infer<typeof RuleSettingsSchema>;
export const variableNames = [
  "nome",
  "cliente",
  "profissional",
  "data",
  "horario",
];
const text = z
  .string()
  .max(2000)
  .refine(
    (value) =>
      [...value.matchAll(/\{([^{}]+)\}/g)].every((match) =>
        variableNames.includes(match[1]),
      ),
    "Use apenas as variáveis disponíveis.",
  );
export const StepSchema = z.object({
  id: z.string().uuid(),
  minutes: z.number().int().min(1).max(43200),
  purpose: z.enum(["followup", "confirmation", "reminder"]),
  whatsapp: z.boolean(),
  sms: z.boolean(),
  whatsappText: text,
  smsText: text.refine(
    (value) => value.length <= 480,
    "SMS deve ter até 480 caracteres.",
  ),
});
export const CadenceSchema = z
  .object({
    enabled: z.boolean(),
    businessHours: z.boolean(),
    window: CalendarSchema.optional(),
    steps: z.array(StepSchema).max(10),
  })
  .superRefine((v, ctx) => {
    if (v.enabled && !v.steps.length)
      ctx.addIssue({
        code: "custom",
        message: "Adicione pelo menos uma etapa.",
      });
    const seen = new Set<string>();
    for (const step of v.steps)
      if (step.purpose !== "followup")
        for (const channel of (["whatsapp", "sms"] as const).filter(
          (ch) => step[ch],
        )) {
          const key = `${step.minutes}:${channel}`;
          if (seen.has(key))
            ctx.addIssue({
              code: "custom",
              message:
                "Não duplique o mesmo canal e antecedência em etapas de agendamento.",
            });
          seen.add(key);
        }
    if (!v.enabled) return;
    for (const s of v.steps) {
      if (!s.whatsapp && !s.sms)
        ctx.addIssue({
          code: "custom",
          message: "Selecione ao menos um canal por etapa.",
        });
      if (
        (s.whatsapp && !s.whatsappText.trim()) ||
        (s.sms && !s.smsText.trim())
      )
        ctx.addIssue({
          code: "custom",
          message: "Preencha a mensagem de cada canal habilitado.",
        });
    }
  });
export type Cadence = z.infer<typeof CadenceSchema>;
export type Step = z.infer<typeof StepSchema>;
export const emptyCadence = (): Cadence => ({
  enabled: false,
  businessHours: true,
  steps: [],
});
export const PreferencesSchema = z
  .object({
    whatsapp: z.boolean(),
    sms: z.boolean(),
    optOut: z.boolean(),
    paused: z.boolean(),
    source: z.string().trim().max(300),
  })
  .refine(
    (v) => v.optOut || v.paused || !(v.whatsapp || v.sms) || !!v.source,
    "Registre a origem da autorização/preferência de contato.",
  );
export type Preferences = z.infer<typeof PreferencesSchema>;
export const emptyPreferences = (): Preferences => ({
  whatsapp: false,
  sms: false,
  optOut: false,
  paused: false,
  source: "",
});
