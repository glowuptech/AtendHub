import { NextResponse } from "next/server";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

export async function POST(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  const { leadId } = await context.params;
  const { data, error } = await auth.supabase.rpc("atendhub_claim_lead", { _organization_id: auth.organizationId, _lead_id: leadId });
  if (error) {
    const status = error.message === "LEAD_ALREADY_CLAIMED" ? 409 : error.code === "42501" ? 403 : 400;
    return apiError(error, status);
  }
  return NextResponse.json(data);
}
