import { NextResponse } from "next/server";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { persistedForm } from "@/features/forms/services/persisted-form";
import { saveForm } from "@/features/forms/services/save-form";

async function listForms(auth: Awaited<ReturnType<typeof sessionOrganizationContext>>, clientId: string | null) {
  if ("error" in auth) return auth.error;
  let query = auth.supabase.from("atendhub_forms").select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id,updated_at").eq("organization_id", auth.organizationId).order("updated_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data: rows, error } = await query;
  if (error) throw error;
  const ids = (rows ?? []).map((row) => row.id);
  const { data: versions, error: versionError } = ids.length ? await auth.supabase.from("atendhub_form_versions").select("id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets").in("form_id", ids).order("number") : { data: [], error: null };
  if (versionError) throw versionError;
  return (rows ?? []).map((row) => persistedForm(row, (versions ?? []).filter((version) => version.form_id === row.id)));
}

export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try { return NextResponse.json(await listForms(auth, new URL(request.url).searchParams.get("clientId"))); } catch (error) { return apiError(error, 500); }
}

export async function POST(request: Request) {
  return saveForm(request);
}
