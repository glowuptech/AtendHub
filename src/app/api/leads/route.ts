import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

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
  fieldValues: z.array(z.unknown()).default([]),
}).refine((value) => Boolean(value.phone || value.email), { message: "Informe telefone ou e-mail.", path: ["phone"] });

const select = "id, organization_id, client_id, professional_id, contact_id, name, phone, email, source, capture_status, stage, owner_id, form_id, form_version_id, origin_submission_id, field_values, notes, next_action, idempotency_key, created_at, updated_at, assigned_at, claimed_at, first_response_at, client:atendhub_clients!atendhub_leads_client_id_fkey(id,name,operation_id), professional:atendhub_professionals!atendhub_leads_professional_id_fkey(id,name)";

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
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) return apiError(new Error("Idempotency-Key obrigatório."), 400);
  const { data: previous } = await auth.supabase.from("atendhub_leads").select(select).eq("organization_id", auth.organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (previous) return NextResponse.json(previous, { status: 200 });
  const { data: lead, error } = await auth.supabase.from("atendhub_leads").insert({
    organization_id: auth.organizationId,
    client_id: input.clientId,
    professional_id: input.professionalId ?? null,
    name: input.name,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    idempotency_key: idempotencyKey,
    source: "manual",
    capture_status: "completed",
    stage: "new",
    next_action: input.nextAction,
    form_id: input.formId ?? null,
    form_version_id: input.formVersionId ?? null,
    origin_submission_id: input.originSubmissionId ?? null,
    field_values: input.fieldValues,
  }).select(select).single();
  if (error?.code === "23505") {
    const { data: concurrent } = await auth.supabase.from("atendhub_leads").select(select).eq("organization_id", auth.organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (concurrent) return NextResponse.json(concurrent, { status: 200 });
  }
  if (error || !lead) return apiError(error ?? new Error("Lead não foi criado."), error?.code === "42501" ? 403 : 409);
  const event = await auth.supabase.from("atendhub_lead_events").insert({ organization_id: auth.organizationId, lead_id: lead.id, actor_id: auth.userId, event_type: "created", to_stage: lead.stage, metadata: { source: input.source } });
  if (event.error) return apiError(event.error, 500);
  return NextResponse.json(lead, { status: 201 });
}
