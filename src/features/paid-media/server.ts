import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { addMetrics, emptyMetrics } from "./metrics";
import { metaConfigured } from "./meta";
import type {
  Account,
  Ad,
  Campaign,
  Client,
  Insight,
  MediaReport,
  Metrics,
  Plan,
} from "./model";

export type Auth = Extract<
  Awaited<ReturnType<typeof sessionOrganizationContext>>,
  { userId: string }
>;
export class MediaError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
export function requireAdmin(auth: Auth) {
  if (auth.role !== "super_admin")
    throw new MediaError(
      "Somente superadministradores podem alterar as campanhas da agência.",
      403,
    );
}
export function paidMediaAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new MediaError(
      "Configure o acesso de servidor para carregar tráfego pago.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function allRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
) {
  const result: T[] = [];
  const size = 500;
  for (let offset = 0; offset < 25000; offset += size) {
    const { data, error } = await fetchPage(offset, offset + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    result.push(...rows);
    if (rows.length < size) return result;
  }
  throw new MediaError(
    "Há muitos registros neste recorte. Selecione um cliente ou um período menor.",
    422,
  );
}
export async function clientScope(auth: Auth, clientId?: string) {
  const org = auth.organizationId;
  const access =
    auth.role === "super_admin"
      ? null
      : await allRows<{ client_id: string }>((from, to) =>
          auth.supabase
            .from("atendhub_team_client_access")
            .select("client_id")
            .eq("organization_id", org)
            .eq("team_member_id", auth.userId)
            .order("client_id")
            .range(from, to),
        );
  if (access && clientId && !access.some((c) => c.client_id === clientId))
    throw new MediaError("Você não tem acesso a este cliente.", 403);
  if (access && !access.length) return [];
  const rows = await allRows<Omit<Client, "code">>((from, to) => {
    let query = auth.supabase
      .from("atendhub_clients")
      .select("id,name")
      .eq("organization_id", org)
      .order("id")
      .range(from, to);
    if (clientId) query = query.eq("id", clientId);
    return query;
  });
  const allowed = access ? new Set(access.map((c) => c.client_id)) : null;
  const visible = rows.filter((row) => !allowed || allowed.has(row.id));
  if (clientId && !visible.length)
    throw new MediaError("Você não tem acesso a este cliente.", 403);
  return visible.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export function reportFailure(error: unknown) {
  if (error instanceof MediaError)
    return { error: error.message, status: error.status };
  const code = (error as { code?: string } | undefined)?.code;
  if (
    ["42P01", "42703", "PGRST204", "PGRST205", "PGRST202"].includes(code ?? "")
  )
    return {
      error:
        "A área aguarda a ativação das migrations de tráfego pago no Supabase.",
      status: 503,
    };
  if (code === "23505" || code === "23503")
    return {
      error:
        "O vínculo selecionado mudou. Recarregue os dados e tente novamente.",
      status: 409,
    };
  console.warn("[paid-media] operation failed", { code });
  return {
    error: "Não foi possível concluir a operação de tráfego pago.",
    status: 500,
  };
}
const chunks = <T>(array: T[]) =>
  Array.from({ length: Math.ceil(array.length / 100) }, (_, i) =>
    array.slice(i * 100, (i + 1) * 100),
  );
type Link = { account_id: string; client_id: string };
type Attribution = {
  campaign_id: string;
  ad_id: string | null;
  lead_id: string;
  channel: string;
  client_id: string;
};
const fromDate = (day: string) =>
  new Date(day + "T00:00:00-03:00").toISOString();
const beforeNextDate = (day: string) =>
  new Date(Date.parse(fromDate(day)) + 86400000).toISOString();

export async function readReport(
  auth: Auth,
  range: { from: string; to: string },
  clientId?: string,
): Promise<MediaReport> {
  const org = auth.organizationId;
  const admin = paidMediaAdmin();
  const clients = await clientScope(auth, clientId);
  const allowed = new Set(clients.map((c) => c.id));
  const canManage = auth.role === "super_admin";
  // The admin view can see reconciliation across accounts. Other sessions see
  // only metrics mapped to one of the authorized clients.
  const [accountRows, links, codes] = await Promise.all([
    allRows<Account>((a, b) =>
      admin
        .from("atendhub_meta_accounts")
        .select("account_id,name,currency,timezone,shared")
        .eq("organization_id", org)
        .order("account_id")
        .range(a, b),
    ),
    allRows<Link>((a, b) =>
      admin
        .from("atendhub_meta_account_clients")
        .select("account_id,client_id")
        .eq("organization_id", org)
        .order("account_id")
        .order("client_id")
        .range(a, b),
    ),
    allRows<{ client_id: string; code: string }>((a, b) =>
      admin
        .from("atendhub_meta_client_codes")
        .select("client_id,code")
        .eq("organization_id", org)
        .order("client_id")
        .range(a, b),
    ),
  ]);
  const clientCodes = new Map(codes.map((c) => [c.client_id, c.code]));
  const visibleLinks = links.filter((l) => allowed.has(l.client_id));
  const accountIds = new Set(visibleLinks.map((l) => l.account_id));
  const accounts = accountRows.filter(
    (a) => accountIds.has(a.account_id) || (canManage && !clientId),
  );
  const accountById = new Map(accounts.map((a) => [a.account_id, a]));
  const [allCampaigns, coverage] = await Promise.all([
    allRows<Campaign>((a, b) => {
      let q = admin
        .from("atendhub_meta_campaigns")
        .select("campaign_id,account_id,name,client_id,stage,manual")
        .eq("organization_id", org)
        .order("campaign_id")
        .range(a, b);
      if (clientId) q = q.eq("client_id", clientId);
      return q;
    }),
    allRows<{ account_id: string; day: string; imported_at: string }>((a, b) =>
      admin
        .from("atendhub_meta_sync_days")
        .select("account_id,day,imported_at")
        .eq("organization_id", org)
        .gte("day", range.from)
        .lte("day", range.to)
        .order("account_id")
        .order("day")
        .range(a, b),
    ),
  ]);
  const campaigns = allCampaigns.filter(
    (c) =>
      accountById.has(c.account_id) &&
      (c.client_id ? allowed.has(c.client_id) : canManage && !clientId),
  );
  // Import and report are grouped by Meta account day and currency.
  const ads = (
    await Promise.all(
      chunks(campaigns.map((c) => c.campaign_id)).map((ids) =>
        allRows<Ad>((a, b) =>
          admin
            .from("atendhub_meta_ads")
            .select("ad_id,campaign_id,name,creative_id,thumbnail,copy")
            .eq("organization_id", org)
            .in("campaign_id", ids)
            .order("ad_id")
            .range(a, b),
        ),
      ),
    )
  ).flat();
  const insightChunks = chunks(ads.map((a) => a.ad_id));
  const adMetrics = new Map<string, Metrics>();
  for (const ids of insightChunks) {
    const insights = await allRows<Insight>((a, b) =>
      admin
        .from("atendhub_meta_ad_insights")
        .select(
          "ad_id,day,spend,impressions,form_leads,whatsapp_conversations,profile_visits,thruplays",
        )
        .eq("organization_id", org)
        .in("ad_id", ids)
        .gte("day", range.from)
        .lte("day", range.to)
        .order("ad_id")
        .order("day")
        .range(a, b),
    );
    for (const row of insights) {
      const m = adMetrics.get(row.ad_id) ?? emptyMetrics();
      adMetrics.set(row.ad_id, addMetrics(m, row));
    }
  }
  const byCampaign = new Map(campaigns.map((c) => [c.campaign_id, c]));
  const campaignMetrics = new Map<string, Metrics>();
  const resultAds = ads.flatMap((ad) => {
    const metrics = adMetrics.get(ad.ad_id);
    const campaign = byCampaign.get(ad.campaign_id)!;
    if (!metrics) return [];
    const aggregated =
      campaignMetrics.get(campaign.campaign_id) ?? emptyMetrics();
    campaignMetrics.set(campaign.campaign_id, addMetrics(aggregated, metrics));
    return campaign.client_id || canManage
      ? [
          {
            ...ad,
            metrics,
            stage: campaign.stage,
            currency: accountById.get(campaign.account_id)!.currency,
          },
        ]
      : [];
  });
  let attributionAvailable = true;
  try {
    const attributed = new Map<string, Attribution>();
    for (const ids of chunks(
      campaigns.filter((c) => c.client_id).map((c) => c.campaign_id),
    )) {
      const rows = await allRows<Attribution>((a, b) =>
        admin
          .from("atendhub_paid_attributions")
          .select("lead_id,campaign_id,ad_id,channel,client_id")
          .eq("organization_id", org)
          .in("campaign_id", ids)
          .gte("occurred_at", fromDate(range.from))
          .lt("occurred_at", beforeNextDate(range.to))
          .order("lead_id")
          .order("channel")
          .range(a, b),
      );
      for (const row of rows) {
        if (byCampaign.get(row.campaign_id)?.client_id !== row.client_id)
          continue;
        // One opportunity counted once, even if a form and WhatsApp both attributed it.
        if (!attributed.has(row.lead_id) || row.channel === "form")
          attributed.set(row.lead_id, row);
      }
    }
    const leadStatuses = new Map<string, string | null>();
    const appointmentLeads = new Set<string>();
    for (const ids of chunks([...attributed.keys()])) {
      const [leads, bookings] = await Promise.all([
        allRows<{ id: string; qualified_at: string | null }>((a, b) =>
          auth.supabase
            .from("atendhub_leads")
            .select("id,qualified_at")
            .eq("organization_id", org)
            .in("id", ids)
            .order("id")
            .range(a, b),
        ),
        allRows<{ lead_id: string }>((a, b) =>
          auth.supabase
            .from("atendhub_appointments")
            .select("lead_id")
            .eq("organization_id", org)
            .in("lead_id", ids)
            .neq("status", "cancelled")
            .order("id")
            .range(a, b),
        ),
      ]);
      leads.forEach((l) => leadStatuses.set(l.id, l.qualified_at));
      bookings.forEach((a) => appointmentLeads.add(a.lead_id));
    }
    for (const row of attributed.values()) {
      if (!leadStatuses.has(row.lead_id)) continue;
      const campaign = campaignMetrics.get(row.campaign_id) ?? emptyMetrics();
      campaign.crmLeads++;
      if (row.channel === "form") campaign.crmForms++;
      else campaign.crmWhatsApp++;
      if (leadStatuses.get(row.lead_id)) campaign.qualified++;
      if (appointmentLeads.has(row.lead_id)) campaign.appointments++;
      campaignMetrics.set(row.campaign_id, campaign);
      const ad = row.ad_id ? adMetrics.get(row.ad_id) : undefined;
      if (ad) {
        ad.crmLeads++;
        if (row.channel === "form") ad.crmForms++;
        else ad.crmWhatsApp++;
        if (leadStatuses.get(row.lead_id)) ad.qualified++;
        if (appointmentLeads.has(row.lead_id)) ad.appointments++;
      }
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205" || code === "42703")
      attributionAvailable = false;
    else throw error;
  }
  const totals = new Map<string, Metrics>();
  const pending = new Map<
    string,
    { currency: string; spend: number; campaigns: number }
  >();
  const resultCampaigns = campaigns
    .map((c) => {
      const currency = accountById.get(c.account_id)!.currency;
      const metrics = campaignMetrics.get(c.campaign_id) ?? emptyMetrics();
      totals.set(
        currency,
        addMetrics(totals.get(currency) ?? emptyMetrics(), metrics),
      );
      if (!c.client_id) {
        const item = pending.get(currency) ?? {
          currency,
          spend: 0,
          campaigns: 0,
        };
        item.spend += metrics.spend;
        item.campaigns++;
        pending.set(currency, item);
      }
      return { ...c, metrics, currency };
    })
    .sort((a, b) => b.metrics.spend - a.metrics.spend);
  const synced = new Map<string, { coveredDays: number; latestSync: string }>();
  for (const row of coverage) {
    const previous = synced.get(row.account_id);
    synced.set(row.account_id, {
      coveredDays: (previous?.coveredDays ?? 0) + 1,
      latestSync:
        !previous || row.imported_at > previous.latestSync
          ? row.imported_at
          : previous.latestSync,
    });
  }
  return {
    canManage,
    metaConfigured: metaConfigured(org),
    attributionAvailable,
    clients: clients.map((c) => ({
      ...c,
      code: clientCodes.get(c.id) ?? null,
    })),
    accounts: accounts.map((a) => ({
      ...a,
      clientIds: visibleLinks
        .filter((l) => l.account_id === a.account_id)
        .map((l) => l.client_id),
      latestSync: synced.get(a.account_id)?.latestSync ?? null,
      coveredDays: synced.get(a.account_id)?.coveredDays ?? 0,
    })),
    campaigns: resultCampaigns,
    ads: resultAds.sort((a, b) => b.metrics.spend - a.metrics.spend),
    totals: [...totals].map(([currency, metrics]) => ({
      currency,
      ...metrics,
    })),
    pending: [...pending.values()],
  };
}

type PlanRow = {
  id: string;
  client_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  objective: string;
  service: string;
  audience: string;
  stages: Plan["stages"];
  status: Plan["status"];
  revision: number;
};
export function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    from: row.starts_on,
    to: row.ends_on,
    objective: row.objective,
    service: row.service,
    audience: row.audience,
    stages: row.stages,
    status: row.status,
    revision: row.revision,
  };
}
export async function readPlans(auth: Auth, clientId: string) {
  await clientScope(auth, clientId);
  const admin = paidMediaAdmin();
  const rows = await allRows<PlanRow>((a, b) =>
    admin
      .from("atendhub_campaign_plans")
      .select(
        "id,client_id,name,starts_on,ends_on,objective,service,audience,stages,status,revision",
      )
      .eq("organization_id", auth.organizationId)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(a, b),
  );
  return rows.map(mapPlan);
}
export async function writePlan(auth: Auth, plan: Plan) {
  requireAdmin(auth);
  await clientScope(auth, plan.clientId);
  const admin = paidMediaAdmin();
  const org = auth.organizationId;
  const ids = [
    ...new Set(Object.values(plan.stages).flatMap((s) => s.campaignIds)),
  ];
  if (ids.length) {
    const { data, error } = await admin
      .from("atendhub_meta_campaigns")
      .select("campaign_id")
      .eq("organization_id", org)
      .eq("client_id", plan.clientId)
      .in("campaign_id", ids);
    if (error) throw error;
    if (data?.length !== ids.length)
      throw new MediaError(
        "Um dos vínculos deixou de pertencer a este cliente.",
        409,
      );
  }
  const values = {
    name: plan.name,
    starts_on: plan.from,
    ends_on: plan.to,
    objective: plan.objective,
    service: plan.service,
    audience: plan.audience,
    stages: plan.stages,
    status: plan.status,
    updated_at: new Date().toISOString(),
  };
  const table = admin.from("atendhub_campaign_plans");
  const result = plan.id
    ? await table
        .update({ ...values, revision: plan.revision! + 1 })
        .eq("organization_id", org)
        .eq("client_id", plan.clientId)
        .eq("id", plan.id)
        .eq("revision", plan.revision)
        .select()
        .maybeSingle()
    : await table
        .insert({ ...values, organization_id: org, client_id: plan.clientId })
        .select()
        .single();
  if (result.error) throw result.error;
  if (!result.data)
    throw new MediaError(
      "O plano mudou desde que você abriu. Recarregue e confira as alterações.",
      409,
    );
  return mapPlan(result.data as PlanRow);
}
