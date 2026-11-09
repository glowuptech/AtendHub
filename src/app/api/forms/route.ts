import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { FormSchema } from "@/domain/schemas";
import { validateRouting } from "@/features/forms/services/routing";

const inputSchema = z.object({ clientId: z.string().uuid(), form: z.unknown(), publish: z.boolean().default(false) });

function toDefinition(row: { id: string; organization_id: string; client_id: string; doctor_id: string | null; name: string; description: string; slug: string; status: string; active_version_id: string | null }, versions: Array<{ id: string; form_id: string; organization_id: string; client_id: string; number: number; state: string; definition: { version?: unknown; fields?: unknown } }>) {
  const mapped = versions.map((version) => ({ ...(version.definition.version as object), id: version.id, formId: version.form_id, organizationId: version.organization_id, clientId: version.client_id, number: version.number, state: version.state, fields: version.definition.fields ?? [] }));
  return { id: row.id, organizationId: row.organization_id, clientId: row.client_id, doctorId: row.doctor_id, name: row.name, description: row.description, slug: row.slug, status: row.status, activeVersionId: row.active_version_id ?? mapped.at(-1)?.id, versions: mapped, fields: mapped.at(-1)?.fields ?? [] };
}

async function listForms(auth: Awaited<ReturnType<typeof sessionOrganizationContext>>, clientId: string | null) {
  if ("error" in auth) return auth.error;
  let query = auth.supabase.from("atendhub_forms").select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").eq("organization_id", auth.organizationId).order("updated_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data: rows, error } = await query;
  if (error) throw error;
  const ids = (rows ?? []).map((row) => row.id);
  const { data: versions, error: versionError } = ids.length ? await auth.supabase.from("atendhub_form_versions").select("id,form_id,organization_id,client_id,number,state,definition").in("form_id", ids).order("number") : { data: [], error: null };
  if (versionError) throw versionError;
  return (rows ?? []).map((row) => toDefinition(row, (versions ?? []).filter((version) => version.form_id === row.id)));
}

export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try { return NextResponse.json(await listForms(auth, new URL(request.url).searchParams.get("clientId"))); } catch (error) { return apiError(error, 500); }
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error("Dados de formulário inválidos."), 400);
  const { data: authorizedClient, error: clientError } = await auth.supabase.from("atendhub_clients").select("id").eq("id", parsed.data.clientId).eq("organization_id", auth.organizationId).maybeSingle();
  if (clientError) return apiError(new Error("Não foi possível validar o cliente."), 500);
  if (!authorizedClient) return apiError(new Error("Cliente não encontrado ou não autorizado."), 403);
  const form = FormSchema.parse(parsed.data.form);
  const version = form.versions.find((item) => item.id === form.activeVersionId) ?? form.versions.at(-1);
  if (!version) return apiError(new Error("Versão do formulário ausente."), 400);
  if (parsed.data.publish) validateRouting(version, form.fields);
  try {
    const { data: created, error } = await auth.supabase.from("atendhub_forms").insert({ organization_id: auth.organizationId, client_id: parsed.data.clientId, doctor_id: form.doctorId, name: form.name, description: form.description ?? "", slug: form.slug, status: parsed.data.publish ? "demo" : "draft" }).select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").single();
    if (error || !created) throw error ?? new Error("Formulário não criado.");
    const { data: savedVersion, error: versionError } = await auth.supabase.from("atendhub_form_versions").insert({ id: version.id, form_id: created.id, organization_id: auth.organizationId, client_id: parsed.data.clientId, number: version.number, state: parsed.data.publish ? "snapshot" : "draft", definition: { version: { ...version, id: version.id, formId: created.id }, fields: form.fields ?? [] }, paths: version.paths ?? [], choice_assets: form.fields.flatMap((field) => field.options.filter((option) => option.imageUrl).map((option) => ({ id: option.id, imageUrl: option.imageUrl, alt: option.alt }))), created_by_id: auth.userId }).select("id,form_id,organization_id,client_id,number,state,definition").single();
    if (versionError || !savedVersion) throw versionError ?? new Error("Versão não criada.");
    const { data: updated, error: updateError } = await auth.supabase.from("atendhub_forms").update({ active_version_id: savedVersion.id, status: parsed.data.publish ? "demo" : "draft", updated_at: new Date().toISOString() }).eq("id", created.id).select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").single();
    if (updateError || !updated) throw updateError ?? new Error("Formulário não atualizado.");
    return NextResponse.json(toDefinition(updated, [savedVersion]), { status: 201 });
  } catch (error) { return apiError(error, 409); }
}
