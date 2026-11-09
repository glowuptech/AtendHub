import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

const schema = z.object({ stage: z.enum(["new", "in_progress", "waiting", "scheduled", "awaiting_scheduling", "confirmed", "rescheduling", "recovery", "lost"]) });

export async function POST(request: Request, context: { params: Promise<{ leadId: string }> }) {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error("Etapa inválida."));
  const { leadId } = await context.params;
  const { data, error } = await auth.supabase.rpc("atendhub_move_lead", { _organization_id: auth.organizationId, _lead_id: leadId, _stage: parsed.data.stage });
  if (error) return apiError(error, error.message === "LEAD_MOVE_FORBIDDEN" ? 403 : 400);
  return NextResponse.json(data);
}
