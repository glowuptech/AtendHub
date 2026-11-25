import { stageGuide, stageLabels } from "@/features/paid-media/model";
import { tenantSlug } from "@/features/client-domains/model";
import { NextResponse } from "next/server";
import { z } from "zod";
import { RangeSchema } from "@/lib/date-range";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import {
  clientScope,
  paidMediaAdmin,
  readReport,
  reportFailure,
  requireAdmin,
} from "@/features/paid-media/server";
import { planInput, stages } from "@/features/paid-media/model";
import { assistantAnswer } from "@/features/paid-media/assistant-model";

export const maxDuration = 60;
const id = z.string().uuid();
const input = z
  .object({
    requestId: id,
    clientId: id,
    mode: z.enum(["analyze", "generate", "improve"]),
    stage: z.enum(stages).optional(),
    period: RangeSchema,
    question: z.string().trim().min(1).max(2500),
    draft: planInput.optional(),
  })
  .refine(
    (v) => v.mode !== "improve" || !!v.stage,
    "Selecione a etapa que deseja aprimorar.",
  )
  .refine(
    (v) => !v.draft || v.draft.clientId === v.clientId,
    "Plano de outro cliente.",
  );

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const columns = "id,mode,stage,question,status,answer,created_at";
function url() {
  const raw = process.env.ATENDHUB_PAID_MEDIA_ASSISTANT_URL;
  if (!raw) return null;
  try {
    const value = new URL(raw);
    return value.protocol === "https:" &&
      !value.username &&
      !value.password &&
      !value.hash
      ? value
      : null;
  } catch {
    return null;
  }
}
const fail = (cause: unknown) => {
  const result = reportFailure(cause);
  return json({ error: result.error }, result.status);
};

export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (tenantSlug(request.headers.get("host")))
    return json(
      { error: "O assistente está disponível no painel administrativo." },
      403,
    );
  const client = id.safeParse(
    new URL(request.url).searchParams.get("clientId"),
  );
  if (!client.success) return json({ error: "Selecione um cliente." }, 400);
  try {
    requireAdmin(auth);
    await clientScope(auth, client.data);
    const { data, error } = await paidMediaAdmin()
      .from("atendhub_paid_media_exchanges")
      .select(columns)
      .eq("organization_id", auth.organizationId)
      .eq("client_id", client.data)
      .eq("actor_id", auth.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);
    if (error) throw error;
    return json({ configured: !!url(), items: (data ?? []).reverse() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (tenantSlug(request.headers.get("host")))
    return json(
      { error: "O assistente está disponível no painel administrativo." },
      403,
    );
  const result = input.safeParse(await request.json().catch(() => null));
  if (!result.success)
    return json(
      { error: result.error.issues[0]?.message ?? "Revise a mensagem." },
      400,
    );
  const value = result.data;
  try {
    requireAdmin(auth);
    const [client] = await clientScope(auth, value.clientId);
    const destination = url();
    if (!destination)
      return json(
        {
          error: "O assistente aguarda a configuração do workflow no servidor.",
        },
        503,
      );
    const org = auth.organizationId;
    const admin = paidMediaAdmin();
    const history = await admin
      .from("atendhub_paid_media_exchanges")
      .select("question,answer")
      .eq("organization_id", org)
      .eq("client_id", client.id)
      .eq("actor_id", auth.userId)
      .eq("status", "answered")
      .eq("mode", value.mode)
      .order("created_at", { ascending: false })
      .limit(5);
    if (history.error) throw history.error;
    const report = await readReport(auth, value.period, client.id);
    const insert = await admin
      .from("atendhub_paid_media_exchanges")
      .insert({
        organization_id: org,
        client_id: client.id,
        actor_id: auth.userId,
        request_id: value.requestId,
        mode: value.mode,
        stage: value.stage ?? null,
        question: value.question,
      })
      .select("id")
      .single();
    if (insert.error?.code === "23505")
      return json(
        {
          error:
            "Essa solicitação já foi registrada. Atualize o histórico para ver o resultado.",
        },
        409,
      );
    if (insert.error) throw insert.error;
    if (!insert.data)
      return json({ error: "Não foi possível preparar a solicitação." }, 500);
    const exchangeId = insert.data.id;
    let answer: unknown;
    try {
      const secret = process.env.ATENDHUB_PAID_MEDIA_ASSISTANT_TOKEN;
      const response = await fetch(destination, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": exchangeId,
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          eventType: "paid_media.assistant_requested",
          id: exchangeId,
          organizationId: org,
          client: { id: client.id, name: client.name },
          methodology: { name: "Método VIDA", legacyName: "AIDA", labels: stageLabels, guidance: stageGuide },
          mode: value.mode,
          stage: value.stage,
          period: value.period,
          question: value.question,
          draft: value.draft,
          history: (history.data ?? []).reverse(),
          coverage: report.accounts.map((a) => ({
            name: a.name,
            currency: a.currency,
            days: a.coveredDays,
            timezone: a.timezone,
          })),
          campaigns: report.campaigns.slice(0, 40).map((c) => ({
            id: c.campaign_id,
            name: c.name,
            currency: c.currency,
            stage: c.stage,
            metrics: c.metrics,
          })),
          creatives: report.ads.slice(0, 30).map((a) => ({
            id: a.ad_id,
            campaignId: a.campaign_id,
            name: a.name,
            currency: a.currency,
            stage: a.stage,
            metrics: a.metrics,
          })),
          attributionAvailable: report.attributionAvailable,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(40000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("ASSISTANT_HTTP");
      const parsed = assistantAnswer.parse(await response.json());
      // Stage-specific suggestions cannot change another stage.
      answer =
        value.stage && parsed.suggestions
          ? {
              ...parsed,
              suggestions: { [value.stage]: parsed.suggestions[value.stage] },
            }
          : parsed;
    } catch {
      await admin
        .from("atendhub_paid_media_exchanges")
        .update({ status: "failed" })
        .eq("organization_id", org)
        .eq("id", exchangeId);
      return json(
        {
          error:
            "O assistente não devolveu uma resposta válida. Seu rascunho foi preservado.",
        },
        502,
      );
    }
    const saved = await admin
      .from("atendhub_paid_media_exchanges")
      .update({ status: "answered", answer })
      .eq("organization_id", org)
      .eq("id", exchangeId)
      .select(columns)
      .single();
    if (saved.error) throw saved.error;
    return json(saved.data);
  } catch (error) {
    return fail(error);
  }
}
