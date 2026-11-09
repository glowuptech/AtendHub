import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { validateAnswer, type FieldValue, type FormDefinition } from "@/domain/schemas";

const createLeadSchema = z.object({
  clientId: z.string().uuid(),
  professionalId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().email().or(z.literal("")).default(""),
  source: z.string().trim().min(1).max(120).default("manual"),
  captureStatus: z.enum(["in_progress", "incomplete", "completed"]).default("in_progress"),
  stage: z.enum(["new", "in_progress", "waiting", "scheduled", "awaiting_scheduling", "confirmed", "rescheduling", "recovery", "lost"]).default("new"),
  nextAction: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(2000).default(""),
  formId: z.string().uuid().nullable().optional(),
  formVersionId: z.string().uuid().nullable().optional(),
  originSubmissionId: z.string().uuid().nullable().optional(),
  fieldValues: z.array(z.object({ questionId: z.string().uuid(), fieldDefinitionId: z.string().uuid(), value: z.unknown(), questionSnapshot: z.record(z.string(), z.unknown()).default({}) })).default([]),
  originalCapturedAt: z.string().datetime().nullable().optional(),
}).refine((value) => Boolean(value.phone || value.email), { message: "Informe telefone ou e-mail.", path: ["phone"] });

const select = "id, organization_id, client_id, professional_id, contact_id, name, phone, email, source, capture_status, stage, owner_id, form_id, form_version_id, origin_submission_id, field_values, notes, next_action, idempotency_key, original_captured_at, queue_entered_at, created_by_id, created_at, updated_at, assigned_at, claimed_at, first_response_at, client:atendhub_clients!atendhub_leads_client_id_fkey(id,name,operation_id), professional:atendhub_professionals!atendhub_leads_professional_id_fkey(id,name)";

export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const query = auth.supabase.from("atendhub_leads").select(select).eq("organization_id", auth.organizationId).order("created_at", { ascending: false });
  const clientId = url.searchParams.get("clientId");
  const stage = url.searchParams.get("stage");
  const search = url.searchParams.get("search")?.trim();
  if (clientId) query.eq("client_id", clientId);
  if (stage && stage !== "all") query.eq("stage", stage);
  if (search) query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return apiError(error, 500);
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = createLeadSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."));
  const input = parsed.data;
  const originalCapturedAt = input.originalCapturedAt ? new Date(input.originalCapturedAt) : new Date();
  if (Number.isNaN(originalCapturedAt.getTime()) || originalCapturedAt.getTime() > Date.now()) return apiError(new Error("Data original inválida ou futura."), 400);
  let persistedForm: FormDefinition | null = null;
  if (input.formId || input.formVersionId) {
    if (!input.formId || !input.formVersionId) return apiError(new Error("Formulário e versão devem ser informados juntos."), 400);
    const { data: versionRow, error: versionError } = await auth.supabase.from("atendhub_form_versions").select("id, form_id, client_id, definition").eq("id", input.formVersionId).eq("form_id", input.formId).eq("client_id", input.clientId).single();
    if (versionError || !versionRow) return apiError(new Error("Versão de formulário não pertence ao cliente selecionado."), 403);
    const raw = versionRow.definition as { version?: unknown; fields?: unknown };
    persistedForm = { ...(raw.version as FormDefinition), fields: (raw.fields ?? []) as FormDefinition["fields"] };
    for (const step of persistedForm.versions.find((item) => item.id === input.formVersionId)?.steps ?? []) {
      const field = persistedForm.fields?.find((item) => item.id === step.question.fieldDefinitionId);
      const answer = input.fieldValues.find((item) => item.questionId === step.question.id)?.value;
      if (field && input.captureStatus === "completed") {
        try { validateAnswer(field, step.question.required, answer as FieldValue); } catch { return apiError(new Error(`Resposta inválida para: ${step.question.label}`), 400); }
      }
    }
  } else if (input.fieldValues.length) return apiError(new Error("Respostas só podem ser enviadas com uma versão de formulário."), 400);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) return apiError(new Error("Idempotency-Key obrigatório."), 400);
  const { data: previous } = await auth.supabase.from("atendhub_leads").select(select).eq("organization_id", auth.organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (previous) return NextResponse.json(previous, { status: 200 });
  const { data: leadId, error } = await auth.supabase.rpc("atendhub_create_manual_lead", { p_organization_id: auth.organizationId, p_client_id: input.clientId, p_professional_id: input.professionalId ?? null, p_name: input.name, p_phone: input.phone, p_email: input.email, p_source: "manual", p_capture_status: input.captureStatus, p_next_action: input.nextAction, p_notes: input.notes, p_form_id: input.formId ?? null, p_form_version_id: input.formVersionId ?? null, p_original_captured_at: originalCapturedAt.toISOString(), p_field_values: input.fieldValues, p_idempotency_key: idempotencyKey, p_actor_id: auth.userId });
  if (error || !leadId) return apiError(error ?? new Error("Lead não foi criado."), error?.code === "42501" ? 403 : 409);
  const { data: lead, error: loadError } = await auth.supabase.from("atendhub_leads").select(select).eq("id", leadId).single();
  if (loadError || !lead) return apiError(loadError ?? new Error("Lead criado, mas não pôde ser lido."), 500);
  return NextResponse.json(lead, { status: 201 });
}
