import { tenantSlug } from "@/features/client-domains/model";
import { readMetaAnalytics } from "@/features/paid-media/analytics-server";
import { tenantAtHost } from "@/features/client-domains/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { daysBetween, localDay, RangeSchema } from "@/lib/date-range";
import {
  discoverMetaAccounts,
  getMetaAccount,
  MetaError,
} from "@/features/paid-media/meta";
import {
  getMetaAccess,
  readMetaCredentialStatus,
  saveMetaAccess,
} from "@/features/paid-media/meta-credentials";
import { identifiers, planInput, stages } from "@/features/paid-media/model";
import {
  clientScope,
  MediaError,
  paidMediaAdmin,
  readPlans,
  readReport,
  reportFailure,
  requireAdmin,
  writePlan,
} from "@/features/paid-media/server";
import {
  importMetaPeriod,
  readAutoSyncStatus,
} from "@/features/paid-media/sync";

export const maxDuration = 60;
const id = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveMetaCredential"),
    token: z
      .string()
      .trim()
      .max(4096)
      .regex(/^[\x21-\x7e]+$/, "Informe um token de acesso válido."),
  }),
  z.object({
    action: z.literal("link"),
    clientId: id,
    accountId: identifiers.account,
    mode: z.enum(["exclusive", "shared", "remove"]),
  }),
  z.object({
    action: z.literal("sync"),
    accountId: identifiers.account,
    from: z.iso.date(),
    to: z.iso.date(),
  }),
  z.object({
    action: z.literal("classify"),
    campaignId: identifiers.entity,
    clientId: id.nullable(),
    stage: z.enum(stages).nullable(),
  }),
  z.object({ action: z.literal("plan"), plan: planInput }),
  z.object({
    action: z.literal("phrase"),
    clientId: id,
    connectionId: id,
    campaignId: identifiers.entity,
    phrase: z.string().trim().min(5).max(300),
  }),
  z.object({ action: z.literal("removePhrase"), clientId: id, ruleId: id }),
]);
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function fail(cause: unknown) {
  if (cause instanceof MetaError)
    return json({ error: cause.message }, cause.status);
  const { error, status } = reportFailure(cause);
  return json({ error }, status);
}
export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const query = new URL(request.url).searchParams;
  const kind = query.get("kind");
  try {
    const host = request.headers.get("host");
    const branded = !!tenantSlug(host);
    const portalClient = branded ? await tenantAtHost(host) : null;
    if (branded && !portalClient)
      return json({ error: "Portal indisponível." }, 404);
    if (
      portalClient &&
      ((kind && kind !== "analytics") ||
        (query.has("clientId") && query.get("clientId") !== portalClient))
    )
      return json(
        {
          error:
            "Esta operação está disponível apenas no painel administrativo.",
        },
        403,
      );
    if (kind === "metaAccounts") {
      requireAdmin(auth);
      return json(
        await discoverMetaAccounts(
          await getMetaAccess(paidMediaAdmin(), auth.organizationId),
        ),
      );
    }
    if (kind === "metaCredential") {
      requireAdmin(auth);
      return json(
        await readMetaCredentialStatus(paidMediaAdmin(), auth.organizationId),
      );
    }
    if (kind === "syncStatus") {
      requireAdmin(auth);
      return json(await readAutoSyncStatus(auth.organizationId));
    }
    const rawClient = portalClient ?? query.get("clientId");
    const client = rawClient ? id.safeParse(rawClient) : null;
    if (client && !client.success)
      return json({ error: "Cliente inválido." }, 400);
    if (kind === "plans" || kind === "phrases") {
      if (!client?.success)
        return json({ error: "Selecione um cliente." }, 400);
      if (kind === "plans") return json(await readPlans(auth, client.data));
      requireAdmin(auth);
      await clientScope(auth, client.data);
      const admin = paidMediaAdmin();
      const [connections, rules] = await Promise.all([
        admin
          .from("atendhub_whatsapp_connections")
          .select("id,name,instance_name")
          .eq("organization_id", auth.organizationId)
          .eq("client_id", client.data)
          .neq("status", "deleted")
          .order("name"),
        admin
          .from("atendhub_paid_whatsapp_rules")
          .select("id,connection_id,campaign_id,phrase")
          .eq("organization_id", auth.organizationId)
          .eq("client_id", client.data)
          .order("created_at"),
      ]);
      if (connections.error || rules.error)
        throw connections.error ?? rules.error;
      return json({ connections: connections.data, rules: rules.data });
    }
    const today = localDay(new Date().toISOString());
    const range = RangeSchema.safeParse({
      from: query.get("from") ?? today,
      to: query.get("to") ?? today,
    });
    if (!range.success)
      return json(
        { error: range.error.issues[0]?.message ?? "Período inválido." },
        400,
      );
    if (kind === "analytics")
      return json(
        await readMetaAnalytics(auth, range.data, client?.data, !!portalClient),
      );
    const report = await readReport(auth, range.data, client?.data);
    return json(portalClient ? { ...report, canManage: false } : report);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (tenantSlug(request.headers.get("host")))
    return json(
      { error: "Use o painel administrativo para alterar tráfego pago." },
      403,
    );
  const input = command.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return json(
      { error: input.error.issues[0]?.message ?? "Dados inválidos." },
      400,
    );
  const value = input.data;
  const org = auth.organizationId;
  try {
    requireAdmin(auth);
    if (value.action === "plan") return json(await writePlan(auth, value.plan));
    const admin = paidMediaAdmin();
    if (value.action === "saveMetaCredential")
      return json(await saveMetaAccess(admin, org, value.token));
    if (value.action === "link") {
      await clientScope(auth, value.clientId);
      const meta =
        value.mode === "remove"
          ? null
          : await getMetaAccount(
              await getMetaAccess(admin, org),
              value.accountId,
            );
      const { error } = await admin.rpc("atendhub_meta_link", {
        p_org: org,
        p_account: value.accountId,
        p_client: value.clientId,
        p_mode: value.mode,
        p_name: meta?.name ?? null,
        p_currency: meta?.currency ?? null,
        p_timezone: meta?.timezone_name ?? null,
      });
      if (error?.message.includes("ACCOUNT_MODE_CONFLICT"))
        return json(
          {
            error:
              "Essa conta já está vinculada a outro cliente. Confira a modalidade do vínculo.",
          },
          409,
        );
      if (error?.message.includes("ACCOUNT_CURRENCY_CHANGED"))
        return json(
          {
            error:
              "A moeda atual da conta difere da moeda gravada. Revise a conta antes de prosseguir.",
          },
          409,
        );
      if (error) throw error;
      return json({ ok: true });
    }
    if (value.action === "sync") {
      const range = RangeSchema.safeParse(value);
      if (!range.success || daysBetween(value.from, value.to) >= 31)
        return json(
          { error: "Sincronize um período de até 31 dias por vez." },
          400,
        );
      const { data: link, error } = await admin
        .from("atendhub_meta_account_clients")
        .select("client_id")
        .eq("organization_id", org)
        .eq("account_id", value.accountId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!link)
        return json(
          { error: "Vincule a conta a um cliente antes de sincronizar." },
          409,
        );
      const result = await importMetaPeriod(
        admin,
        org,
        await getMetaAccess(admin, org),
        value.accountId,
        range.data,
      );
      if (!result.imported)
        return json(
          {
            error:
              "Uma importação mais recente já atualizou esse período. Recarregue o relatório.",
          },
          409,
        );
      return json({ ok: true, rows: result.rows });
    }
    if (value.action === "classify") {
      if (value.clientId) await clientScope(auth, value.clientId);
      const { data, error } = await admin
        .from("atendhub_meta_campaigns")
        .update({ client_id: value.clientId, stage: value.stage, manual: true })
        .eq("organization_id", org)
        .eq("campaign_id", value.campaignId)
        .select("campaign_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new MediaError("Campanha indisponível.", 404);
      return json({ ok: true });
    }
    await clientScope(auth, value.clientId);
    const result =
      value.action === "removePhrase"
        ? await admin
            .from("atendhub_paid_whatsapp_rules")
            .delete()
            .eq("organization_id", org)
            .eq("client_id", value.clientId)
            .eq("id", value.ruleId)
        : await admin.rpc("atendhub_save_paid_whatsapp_rule", {
            p_org: org,
            p_client: value.clientId,
            p_connection: value.connectionId,
            p_campaign: value.campaignId,
            p_phrase: value.phrase,
          });
    if (result.error?.code === "23505")
      return json(
        { error: "Já existe uma regra para essa frase nesta conexão." },
        409,
      );
    if (result.error?.message.includes("INVALID_PAID_RULE"))
      return json(
        {
          error:
            "A campanha e o número precisam pertencer ao mesmo cliente, e a frase precisa ser válida.",
        },
        422,
      );
    if (result.error) throw result.error;
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
