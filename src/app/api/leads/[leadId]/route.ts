import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

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
  const auth = await organizationContext();
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
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  const { leadId } = await context.params;
  const { data, error } = await auth.supabase.from("atendhub_leads").select("*, client:atendhub_clients!inner(id,name,operation_id), professional:atendhub_professionals(id,name), events:atendhub_lead_events(*)").eq("id", leadId).eq("organization_id", auth.organizationId).single();
  if (error || !data) return apiError(error ?? new Error("Lead não encontrado."), 404);
  return NextResponse.json(data);
}
