import { tenantSlug } from "@/features/client-domains/model";
import { tenantAtHost } from "@/features/client-domains/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { persistedForm } from "@/features/forms/services/persisted-form";
import { FormSchema, type FieldValue } from "@/domain/schemas";
import { eligibleSteps } from "@/features/forms/services/routing";
import { settingsOf } from "@/features/forms/services/settings";
import { validateAnswer } from "@/domain/schemas";

const payloadSchema = z.object({
  sessionId: z.string().min(1).max(100),
  idempotencyKey: z.string().uuid(),
  contacts: z.object({ name: z.string().max(200), phone: z.string().max(200), email: z.string().max(200) }),
  answers: z.record(z.string(), z.unknown()),
  complete: z.boolean(),
  versionId: z.string().uuid().optional(),
  campaign: z.unknown().optional(),
  ad: z.unknown().optional(),
  nextIndex: z.number().int().min(0).optional(),
});
const eventSchema = z.object({
  eventType: z.enum(["view", "action"]),
  sessionId: z.string().min(1).max(100),
  actionId: z.string().max(120).optional(),
});

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function load(slug: string, host: string | null) {
  const tenant = tenantSlug(host) ? await tenantAtHost(host) : undefined;
  if (tenant === null) return null;
  const supabase = admin();
  let query = supabase.from("atendhub_forms").select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").eq("slug", slug).eq("status", "demo");
  if (tenant) query = query.eq("client_id", tenant);
  const { data: row, error } = await query.maybeSingle();
  if (error || !row) return null;
  const { data: versions, error: versionError } = await supabase.from("atendhub_form_versions").select("id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets").eq("form_id", row.id).eq("id", row.active_version_id).eq("state", "snapshot").limit(1);
  if (versionError || !versions?.[0]) return null;
  const { data: client } = await supabase.from("atendhub_clients").select("name").eq("id", row.client_id).maybeSingle();
  const parsed = FormSchema.safeParse(persistedForm(row, versions, false));
  if (!parsed.success || parsed.data.versions[0].settings?.enabled === false) return null;
  return { ...parsed.data, clinicName: client?.name ?? row.name };
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const form = await load((await context.params).slug, request.headers.get("host"));
  if (!form) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  return NextResponse.json(form, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const body = await request.json().catch(() => null);
  const form = await load((await context.params).slug, request.headers.get("host"));
  if (!form) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  const version = form.versions.find((item) => item.id === form.activeVersionId);
  if (!version) return NextResponse.json({ error: "Versão publicada indisponível." }, { status: 409 });
  const event = eventSchema.safeParse(body);
  if (event.success) {
    const { error } = await admin().from("atendhub_public_form_events").upsert({
      form_id: form.id,
      form_version_id: version.id,
      session_id: event.data.sessionId,
      event_type: event.data.eventType,
      action_id: event.data.actionId ?? "",
    }, { onConflict: "form_id,session_id,event_type,action_id" });
    if (error) return NextResponse.json({ error: "Não foi possível registrar o evento." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados do formulário inválidos." }, { status: 400 });
  if (parsed.data.versionId && parsed.data.versionId !== version.id) return NextResponse.json({ error: "O formulário foi atualizado. Reabra o link para preencher a versão atual." }, { status: 409 });
  const settings = settingsOf(version.settings);
  const contacts = parsed.data.contacts;
  for (const key of ["name", "phone", "email"] as const) {
    const config = settings.contacts[key];
    const value = config.enabled ? contacts[key].trim() : "";
    contacts[key] = value;
    if (config.enabled && config.required && !value) return NextResponse.json({ error: `Preencha ${config.label}` }, { status: 422 });
    if (config.enabled && key === "email" && value && !/^\S+@\S+\.\S+$/.test(value)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 422 });
    if (config.enabled && key === "phone" && value && !/^\+?[\d ()-]{8,25}$/.test(value)) return NextResponse.json({ error: "Informe um telefone válido." }, { status: 422 });
  }
  const fields = form.fields ?? [];
  const submittedAnswers = parsed.data.answers as Record<string, FieldValue>;
  const steps = eligibleSteps(version, fields, submittedAnswers);
  const allowed = new Set(steps.map((step) => step.question.id));
  const answers = Object.fromEntries(Object.entries(submittedAnswers).filter(([id]) => allowed.has(id))) as Record<string, FieldValue>;
  for (const step of steps) {
      if (!parsed.data.complete && answers[step.question.id] === undefined) continue;
      const field = fields.find((item) => item.id === step.question.fieldDefinitionId);
      if (!field) return NextResponse.json({ error: "Campo publicado indisponível." }, { status: 409 });
      try { validateAnswer(field, step.question.required, answers[step.question.id]); } catch { return NextResponse.json({ error: "Confira as respostas antes de continuar." }, { status: 422 }); }
  }
  const supabase = admin();
  const responses = steps.filter((step) => answers[step.question.id] !== undefined).map((step) => ({
    question_id: step.question.id, question_snapshot: step.question, value: answers[step.question.id],
  }));
  const { data: leadId, error } = await supabase.rpc("atendhub_capture_form_answers", {
    p_form: form.id, p_version: version.id, p_key: parsed.data.idempotencyKey,
    p_contacts: contacts, p_responses: responses, p_complete: parsed.data.complete,
  });
  if (error || !leadId) return NextResponse.json({ error: "Não foi possível registrar as respostas. Tente novamente." }, { status: 409 });
  const campaignId = z.string().regex(/^\d{1,30}$/).safeParse(parsed.data.campaign);
  const adId = z.string().regex(/^\d{1,30}$/).safeParse(parsed.data.ad);
  if (campaignId.success) {
    const { error: attributionError } = await supabase.rpc("atendhub_attribute_form_campaign", {
      p_org: form.organizationId, p_client: form.clientId, p_lead: leadId,
      p_campaign: campaignId.data, p_ad: adId.success ? adId.data : null,
    });
    if (attributionError && attributionError.code !== "PGRST202") {
      console.warn("[form-capture] campaign attribution failed", { code: attributionError.code });
    }
  }
  return NextResponse.json({ ok: true, leadId, complete: parsed.data.complete }, { status: parsed.data.complete ? 201 : 200 });
}
