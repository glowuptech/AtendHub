import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { FormSchema, type FormDefinition, type FieldValue } from "@/domain/schemas";
import { eligibleSteps, pathForAnswer } from "@/features/forms/services/routing";
import { settingsOf } from "@/features/forms/services/settings";
import { validateAnswer } from "@/domain/schemas";

const payloadSchema = z.object({
  sessionId: z.string().min(1).max(100),
  idempotencyKey: z.string().uuid(),
  contacts: z.object({ name: z.string().max(200), phone: z.string().max(200), email: z.string().max(200) }),
  answers: z.record(z.string(), z.unknown()),
  complete: z.boolean(),
  nextIndex: z.number().int().min(0).optional(),
});

type VersionRow = {
  id: string; form_id: string; organization_id: string; client_id: string;
  number: number; state: string; definition: { version?: unknown; fields?: unknown[] };
  paths: unknown; choice_assets: Array<{ id: string; imageUrl?: string; alt?: string }>;
};

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function publicForm(row: { id: string; organization_id: string; client_id: string; doctor_id: string | null; name: string; description: string; slug: string; status: string; active_version_id: string | null }, versions: VersionRow[], clinicName: string) {
  const mappedVersions = versions.map((version) => {
    const assets = new Map((version.choice_assets ?? []).map((asset) => [asset.id, asset]));
    const definition = version.definition ?? {};
    const fields = (definition.fields ?? []).map((field) => {
      const item = field as { options?: Array<{ id: string; imageUrl?: string; alt?: string }> };
      return { ...(field as Record<string, unknown>), options: (item.options ?? []).map((option) => ({ ...option, ...(assets.get(option.id) ?? {}) })) };
    });
    const versionDefinition = (definition.version ?? {}) as Record<string, unknown>;
    return { ...versionDefinition, id: version.id, formId: version.form_id, organizationId: version.organization_id, clientId: version.client_id, number: version.number, state: version.state, paths: versionDefinition.paths ?? version.paths ?? [], fields };
  });
  const activeVersionId = row.active_version_id ?? mappedVersions.at(-1)?.id ?? null;
  const active = mappedVersions.find((version) => version.id === activeVersionId) ?? mappedVersions.at(-1);
  return { id: row.id, organizationId: row.organization_id, clientId: row.client_id, doctorId: row.doctor_id, name: row.name, description: row.description, slug: row.slug, status: row.status, activeVersionId, versions: mappedVersions, fields: active?.fields ?? [], clinicName } as unknown as FormDefinition & { clinicName: string };
}

async function load(slug: string) {
  const supabase = admin();
  const { data: row, error } = await supabase.from("atendhub_forms").select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").eq("slug", slug).eq("status", "demo").maybeSingle();
  if (error || !row) return null;
  const { data: versions, error: versionError } = await supabase.from("atendhub_form_versions").select("id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets").eq("form_id", row.id).eq("id", row.active_version_id).eq("state", "snapshot").limit(1);
  if (versionError || !versions?.[0]) return null;
  const { data: client } = await supabase.from("atendhub_clients").select("name").eq("id", row.client_id).maybeSingle();
  const form = publicForm(row, versions as VersionRow[], client?.name ?? row.name);
  const parsed = FormSchema.safeParse(form);
  return parsed.success ? form : null;
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const form = await load((await context.params).slug);
  if (!form) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  return NextResponse.json(form, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados do formulário inválidos." }, { status: 400 });
  const form = await load((await context.params).slug);
  if (!form) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  const version = form.versions.find((item) => item.id === form.activeVersionId);
  if (!version) return NextResponse.json({ error: "Versão publicada indisponível." }, { status: 409 });
  const settings = settingsOf(version.settings);
  const contacts = parsed.data.contacts;
  for (const key of ["name", "phone", "email"] as const) {
    const config = settings.contacts[key];
    const value = contacts[key].trim();
    if (config.enabled && config.required && !value) return NextResponse.json({ error: `Preencha ${config.label}` }, { status: 422 });
    if (config.enabled && key === "email" && value && !/^\S+@\S+\.\S+$/.test(value)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 422 });
    if (config.enabled && key === "phone" && value && !/^\+?[\d ()-]{8,25}$/.test(value)) return NextResponse.json({ error: "Informe um telefone válido." }, { status: 422 });
  }
  const fields = form.fields ?? [];
  const submittedAnswers = parsed.data.answers as Record<string, FieldValue>;
  const steps = eligibleSteps(version, fields, submittedAnswers);
  const allowed = new Set(steps.map((step) => step.question.id));
  const answers = Object.fromEntries(Object.entries(submittedAnswers).filter(([id]) => allowed.has(id))) as Record<string, FieldValue>;
  if (parsed.data.complete) {
    for (const step of steps) {
      const field = fields.find((item) => item.id === step.question.fieldDefinitionId);
      if (!field) return NextResponse.json({ error: "Campo publicado indisponível." }, { status: 409 });
      try { validateAnswer(field, step.question.required, answers[step.question.id]); } catch { return NextResponse.json({ error: "Confira as respostas antes de continuar." }, { status: 422 }); }
    }
  }
  const supabase = admin();
  const existing = await supabase.from("atendhub_leads").select("id,capture_status").eq("form_id", form.id).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing.data?.id && existing.data.capture_status === "completed") return NextResponse.json({ ok: true, leadId: existing.data.id, duplicate: true });
  const leadPayload = { organization_id: form.organizationId, client_id: form.clientId, professional_id: form.doctorId, name: contacts.name || contacts.email || contacts.phone || "Contato sem identificação", phone: contacts.phone, email: contacts.email, source: form.name, capture_status: parsed.data.complete ? "completed" : "in_progress", stage: "new", form_id: form.id, form_version_id: version.id, origin_submission_id: existing.data?.id ?? crypto.randomUUID(), field_values: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })), idempotency_key: parsed.data.idempotencyKey, original_captured_at: new Date().toISOString(), next_action: parsed.data.complete ? "Iniciar atendimento" : "Aguardando conclusão do formulário" };
  const { data: lead, error: leadError } = await supabase.from("atendhub_leads").upsert(leadPayload, { onConflict: "form_id,idempotency_key" }).select("id").single();
  if (leadError || !lead) return NextResponse.json({ error: "Não foi possível registrar o cadastro." }, { status: 500 });
  const responseRows = steps.filter((step) => answers[step.question.id] !== undefined).map((step) => ({ organization_id: form.organizationId, client_id: form.clientId, lead_id: lead.id, form_id: form.id, form_version_id: version.id, question_id: step.question.id, question_snapshot: step.question, value: answers[step.question.id] }));
  if (responseRows.length) { const { error } = await supabase.from("atendhub_lead_responses").upsert(responseRows, { onConflict: "lead_id,question_id" }); if (error) return NextResponse.json({ error: "Cadastro criado, mas as respostas não foram salvas." }, { status: 500 }); }
  return NextResponse.json({ ok: true, leadId: lead.id, complete: parsed.data.complete }, { status: parsed.data.complete ? 201 : 200 });
}
