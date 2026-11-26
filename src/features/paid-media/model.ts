import { z } from "zod";
import { RangeSchema } from "@/lib/date-range";

export const stages = ["ATR", "INT", "DES", "ACA"] as const;
export type Stage = (typeof stages)[number];
export const stageLabels: Record<Stage, string> = {
  ATR: "Visibilidade",
  INT: "Interesse",
  DES: "Desejo",
  ACA: "Agendamento",
};
export const stagePrefixes: Record<Stage, string> = { ATR: "VIS", INT: "INT", DES: "DES", ACA: "AGE" };
export const stageGuide: Record<Stage, string> = {
  ATR: "Apresente o profissional ao público que ele quer atender. Use anúncios de posicionamento para gerar visitas ao perfil.",
  INT: "Mostre os serviços e como funciona o atendimento, partindo das dúvidas e necessidades de quem já demonstrou curiosidade.",
  DES: "Use principalmente remarketing, com provas sociais e resultados relevantes para quem demonstrou interesse. Convide a pessoa a agendar já nesta etapa.",
  ACA: "Use exclusivamente remarketing para quem avançou pelo Desejo e ainda não agendou. Retome o benefício para quem abandonou o formulário. No WhatsApp, esclareça dúvidas e combine um horário. Exclua quem já agendou.",
};
export const identifiers = {
  account: z.string().regex(/^act_[0-9]{1,30}$/),
  entity: z.string().regex(/^[0-9]{1,30}$/),
};
export type MetaCredentialStatus = {
  configured: boolean;
  updatedAt: string | null;
  setupMessage: string | null;
};
export const stageMetric: Record<Stage, string> = {
  ATR: "Visitas ao perfil",
  INT: "ThruPlays",
  DES: "Captações por origem",
  ACA: "Leads qualificados",
};
export const planStage = z.object({
  budgetCents: z.number().int().min(0).max(100000000000),
  hypothesis: z.string().max(2500),
  creative: z.string().max(3500),
  destination: z.string().max(500),
  target: z.string().max(500),
  campaignIds: z.array(identifiers.entity).max(50),
});
export const planInput = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    clientId: z.string().uuid(),
    name: z.string().trim().min(2).max(150),
    from: z.iso.date(),
    to: z.iso.date(),
    objective: z.string().max(2000),
    service: z.string().max(300),
    audience: z.string().max(2000),
    stages: z.object({
      ATR: planStage,
      INT: planStage,
      DES: planStage,
      ACA: planStage,
    }),
    status: z.enum(["draft", "approved", "archived"]),
  })
  .refine(
    (v) => RangeSchema.safeParse(v).success,
    "Informe um período válido de até 366 dias.",
  )
  .refine((v) => !!v.id === !!v.revision, "Versão do plano inválida.");
export type Plan = z.infer<typeof planInput>;

export type Account = {
  account_id: string;
  name: string;
  currency: string;
  timezone: string;
  shared: boolean;
};
export type MetaAutoSyncStatus = {
  configured: boolean;
  accounts: {
    accountId: string;
    lastAttemptAt: string | null;
    state: "pending" | "syncing" | "interrupted" | "succeeded" | "failed";
    error: string | null;
  }[];
};
export type Client = { id: string; name: string; code: string | null };
export type Campaign = {
  campaign_id: string;
  account_id: string;
  name: string;
  client_id: string | null;
  stage: Stage | null;
  manual: boolean;
};
export type Ad = {
  ad_id: string;
  campaign_id: string;
  name: string;
  creative_id: string | null;
  thumbnail: string | null;
  copy: string | null;
};
export type Insight = {
  day: string;
  ad_id: string;
  spend: number;
  impressions: number;
  form_leads: number | null;
  whatsapp_conversations: number | null;
  profile_visits: number | null;
  thruplays: number | null;
};
export type Metrics = Omit<Insight, "day" | "ad_id"> & {
  crmLeads: number;
  crmForms: number;
  crmWhatsApp: number;
  qualified: number;
  appointments: number;
};
export type MediaDay = {
  currency: string;
  day: string;
  spend: number;
  form_leads: number | null;
  whatsapp_conversations: number | null;
};
export type MetaDelivery = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  linkClicks: number | null;
  engagement: number | null;
};
export type MetaSegment = {
  key: string;
  spend: number | null;
  impressions: number | null;
  linkClicks: number | null;
  formLeads: number | null;
};
export type MetaAccountAnalytics = {
  accountId: string;
  delivery: MetaDelivery | null;
  placements: MetaSegment[] | null;
  ages: MetaSegment[] | null;
  genders: MetaSegment[] | null;
  billing: { spendLimit: number | null; remainingLimit: number | null } | null;
};
export type MediaAnalytics = { accounts: MetaAccountAnalytics[] };
export type MediaReport = {
  canManage: boolean;
  attributionAvailable: boolean;
  clients: Client[];
  accounts: Array<
    Account & {
      clientIds: string[];
      latestSync: string | null;
      coveredDays: number;
    }
  >;
  campaigns: Array<Campaign & { metrics: Metrics; currency: string }>;
  ads: Array<Ad & { metrics: Metrics; currency: string; stage: Stage | null }>;
  totals: Array<Metrics & { currency: string }>;
  daily: MediaDay[];
  pending: Array<{ currency: string; spend: number; campaigns: number }>;
};
export function emptyPlan(clientId: string, day: string): Plan {
  const stage = () => ({
    budgetCents: 0,
    hypothesis: "",
    creative: "",
    destination: "",
    target: "",
    campaignIds: [],
  });
  return {
    clientId,
    name: "",
    from: day,
    to: day,
    objective: "",
    service: "",
    audience: "",
    status: "draft",
    stages: { ATR: stage(), INT: stage(), DES: stage(), ACA: stage() },
  };
}

export type CreativePreview = {
  preview: string | null;
  videoId?: string;
  source?: string;
  ratio?: number;
};

export type CreativeAsset = CreativePreview & {
  key: string;
  adId: string;
  campaignId: string;
  name: string;
  type: "image" | "video";
  preview: string | null;
  metrics: {
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    leads: number | null;
    conversations: number | null;
  } | null;
};
