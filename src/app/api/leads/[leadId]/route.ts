import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  captureStatus: z.enum(["in_progress", "incomplete", "completed"]).optional(),
  nextAction: z.string().trim().max(500).optional(),
  professionalId: z.string().uuid().nullable().optional(),
  fieldValues: z.array(z.unknown()).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ leadId: string }> }) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { leadId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."));
  const input = parsed.data;
  const values = Object.fromEntries(Object.entries({
    name: input.name,
    phone: input.phone,
    email: input.email,
    source: input.source,
    capture_status: input.captureStatus,
    next_action: input.nextAction,
    professional_id: input.professionalId,
    field_values: input.fieldValues,
    updated_at: new Date().toISOString(),
  }).filter(([, value]) => value !== undefined));
  const { data, error } = await auth.supabase.from("atendhub_leads").update(values).eq("id", leadId).eq("organization_id", auth.organizationId).select("*").single();
  if (error || !data) return apiError(error ?? new Error("Lead não encontrado."), error?.code === "42501" ? 403 : 404);
  const event = await auth.supabase.from("atendhub_lead_events").insert({ organization_id: auth.organizationId, lead_id: leadId, actor_id: auth.userId, event_type: "edited", metadata: { fields: Object.keys(values).filter((key) => key !== "updated_at") } });
  if (event.error) return apiError(event.error, 500);
  return NextResponse.json(data);
}

export async function GET(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { leadId } = await context.params;
  if (!z.string().uuid().safeParse(leadId).success)
    return NextResponse.json({ error: "Identificador de lead inválido." }, { status: 400 });
  const { data: lead, error } = await auth.supabase.from("atendhub_leads")
    .select("id,organization_id,client_id,name,phone,email,source,capture_status,stage,owner_id,form_id,form_version_id,notes,next_action,original_captured_at,created_at,queue_entered_at")
    .eq("organization_id", auth.organizationId).eq("id", leadId).maybeSingle();
  if (error) return apiError(error, error.code === "42501" ? 403 : 500);
  if (!lead) return NextResponse.json({ error: "Lead indisponível para esta sessão." }, { status: 404 });

  const scoped = (table: string, fields: string) => auth.supabase.from(table).select(fields)
    .eq("organization_id", auth.organizationId).eq("lead_id", leadId);
  const [events, responses, conversations, client] = await Promise.all([
    scoped("atendhub_lead_events", "id,event_type,from_stage,to_stage,created_at").order("created_at", { ascending: false }),
    scoped("atendhub_lead_responses", "*"),
    scoped("atendhub_inbox_conversations", "id").order("last_message_at", { ascending: false, nullsFirst: false }),
    auth.supabase.from("atendhub_clients").select("id,name").eq("id", lead.client_id).eq("organization_id", auth.organizationId).maybeSingle(),
  ]);
  return NextResponse.json({ ...lead, client: client.data, events: events.data, responses: responses.data,
    conversations: conversations.data, warnings: [
      ...(events.error ? ["Não foi possível carregar o histórico de movimentações."] : []),
      ...(responses.error ? ["Não foi possível carregar as respostas do formulário."] : []),
      ...(conversations.error ? ["Não foi possível consultar as conversas."] : []),
    ] });
}
