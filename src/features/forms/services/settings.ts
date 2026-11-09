import { z } from "zod";
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const contact = z.object({
  enabled: z.boolean(),
  required: z.boolean(),
  label: z.string().trim().min(1).max(80),
});
const introBlock = z.object({
  text: z.string().max(2000),
  style: z.enum(["title", "highlight", "support"]).default("support"),
  align: z.enum(["left", "center", "right"]).default("left"),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
});
export const FormSettingsSchema = z.object({
  description: z.string().max(1500).default(""),
  introduction: z.object({
    mode: z.enum(["separate", "integrated", "none"]).default("integrated"),
    title: z.string().max(160).default(""),
    blocks: z.array(introBlock).max(20).default([]),
    buttonLabel: z.string().max(80).default("Começar"),
    align: z.enum(["left", "center", "right"]).default("center"),
    maxWidth: z.number().min(280).max(1000).default(620),
    vertical: z.enum(["top", "center", "bottom"]).default("center"),
    logo: z.string().max(1500000).default(""),
    inheritAppearance: z.boolean().default(true),
  }).prefault({}),
  enabled: z.boolean().default(true),
  contactPosition: z.enum(["start", "end"]).default("end"),
  contacts: z
    .object({ name: contact, phone: contact, email: contact })
    .default({
      name: { enabled: true, required: true, label: "Nome" },
      phone: { enabled: true, required: true, label: "WhatsApp" },
      email: { enabled: false, required: false, label: "E-mail" },
    }),
  appearance: z
    .object({
      primary: color.default("#2459d3"),
      button: color.default("#2459d3"),
      buttonText: color.default("#ffffff"),
      background: color.default("#ffffff"),
      panelOpacity: z.number().int().min(0).max(100).default(100),
      overlay: color.default("#000000"),
      overlayOpacity: z.number().int().min(0).max(100).default(0),
      text: color.default("#172237"),
      border: color.default("#dce2ec"),
      radius: z.number().min(0).max(50).default(12),
      font: z
        .enum([
          "system",
          "Arial",
          "Verdana",
          "Georgia",
          "Trebuchet MS",
          "Palatino",
        ])
        .default("system"),
      cover: z
        .string()
        .max(1500000)
        .refine((v) => !v || /^data:image\/(png|jpeg|webp);base64,/.test(v))
        .default(""),
      backgroundImage: z
        .string()
        .max(1500000)
        .refine((v) => !v || /^data:image\/(png|jpeg|webp);base64,/.test(v))
        .default(""),
    })
    .prefault({}),
  tracking: z
    .object({
      pixelId: z
        .string()
        .regex(/^\d{5,30}$|^$/)
        .default(""),
      pageView: z.boolean().default(true),
      lead: z.boolean().default(true),
      viewSeconds: z.union([z.literal(5), z.literal(10)]).default(5),
      abandonMinutes: z.number().int().min(1).max(1440).default(30),
    })
    .prefault({}),
});
export type FormSettings = z.infer<typeof FormSettingsSchema>;
// Drafts may temporarily contain empty labels while typing. Validate at save, not render.
export const settingsOf = (value?: unknown): FormSettings => {
  const defaults = FormSettingsSchema.parse({});
  if (!value) return defaults;
  const v = value as Partial<FormSettings>;
  return {
    ...defaults,
    ...v,
    contacts: { ...defaults.contacts, ...v.contacts },
    introduction: { ...defaults.introduction, ...v.introduction },
    appearance: { ...defaults.appearance, ...v.appearance },
    tracking: { ...defaults.tracking, ...v.tracking },
  };
};
