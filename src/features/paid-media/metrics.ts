import type { Insight, Metrics, Stage } from "./model";

export const emptyMetrics = (): Metrics => ({
  spend: 0,
  impressions: 0,
  form_leads: null,
  whatsapp_conversations: null,
  profile_visits: null,
  thruplays: null,
  crmLeads: 0,
  crmForms: 0,
  crmWhatsApp: 0,
  qualified: 0,
  appointments: 0,
});
const actionKeys = [
  "form_leads",
  "whatsapp_conversations",
  "profile_visits",
  "thruplays",
] as const;
export function addMetrics(
  target: Metrics,
  row: Omit<Insight, "day" | "ad_id"> & Partial<Metrics>,
) {
  target.spend += Number(row.spend);
  target.impressions += Number(row.impressions);
  for (const key of actionKeys)
    if (row[key] != null) target[key] = (target[key] ?? 0) + Number(row[key]);
  target.crmLeads += row.crmLeads ?? 0;
  target.crmForms += row.crmForms ?? 0;
  target.crmWhatsApp += row.crmWhatsApp ?? 0;
  target.qualified += row.qualified ?? 0;
  target.appointments += row.appointments ?? 0;
  return target;
}
export const cpm = (m: Metrics) =>
  m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null;
export const cost = (spend: number, count: number | null) =>
  count && count > 0 ? spend / count : null;
export function primaryResult(stage: Stage | null, m: Metrics) {
  if (stage === "ATR") return m.profile_visits;
  if (stage === "INT") return m.thruplays;
  if (stage === "ACA") return m.qualified;
  // Preserve separate denominators for forms and conversations.
  return null;
}
