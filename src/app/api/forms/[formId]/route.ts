import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { FormSchema } from "@/domain/schemas";
import { validateRouting } from "@/features/forms/services/routing";

const inputSchema = z.object({ form: z.unknown(), publish: z.boolean().default(false) });

function mapForm(row: { id: string; organization_id: string; client_id: string; doctor_id: string | null; name: string; description: string; slug: string; status: string; active_version_id: string | null }, versions: Array<{ id: string; form_id: string; organization_id: string; client_id: string; number: number; state: string; paths?: unknown; choice_assets?: Array<{ id: string; imageUrl?: string; alt?: string }>; definition: { version?: unknown; fields?: Array<{ options?: Array<{ id: string; imageUrl?: string; alt?: string }> }> } }>) {
  const mapped = versions.map((version) => {
    const assets = new Map((version.choice_assets ?? []).map((asset) => [asset.id, asset]));
    const fields = (version.definition.fields ?? []).map((field) => ({ ...field, options: (field.options ?? []).map((option) => ({ ...option, ...(assets.get(option.id) ?? {}) })) }));
    return { ...(version.definition.version as object), id: version.id, formId: version.form_id, organizationId: version.organization_id, clientId: version.client_id, number: version.number, state: version.state, paths: (version.definition.version as { paths?: unknown })?.paths ?? version.paths ?? [], fields };
  });
  return { id: row.id, organizationId: row.organization_id, clientId: row.client_id, doctorId: row.doctor_id, name: row.name, description: row.description, slug: row.slug, status: row.status, activeVersionId: row.active_version_id ?? mapped.at(-1)?.id, versions: mapped, fields: mapped.at(-1)?.fields ?? [] };
}

async function load(auth: Exclude<Awaited<ReturnType<typeof sessionOrganizationContext>>, { error: unknown }>, formId: string) {
  const { data: row, error } = await auth.supabase.from("atendhub_forms").select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").eq("id", formId).eq("organization_id", auth.organizationId).single();
  if (error || !row) throw error ?? new Error("Formulário não encontrado.");
  const { data: versions, error: versionError } = await auth.supabase.from("atendhub_form_versions").select("id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets").eq("form_id", formId).order("number");
  if (versionError) throw versionError;
  return { row, versions: versions ?? [] };
}

export async function GET(_request: Request, context: { params: Promise<{ formId: string }> }) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try { const data = await load(auth, (await context.params).formId); return NextResponse.json(mapForm(data.row, data.versions)); } catch (error) { return apiError(error, 404); }
}

export async function PUT(request: Request, context: { params: Promise<{ formId: string }> }) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error("Dados de formulário inválidos."), 400);
  try {
    const form = FormSchema.parse(parsed.data.form);
    const formId = (await context.params).formId;
    const current = await load(auth, formId);
    const currentVersion = current.versions.find((version) => version.id === form.activeVersionId) ?? current.versions.at(-1);
    if (!currentVersion) throw new Error("Versão ausente.");
    if (parsed.data.publish) validateRouting(form.versions.find((version) => version.id === form.activeVersionId) ?? form.versions.at(-1)!, form.fields);
    const nextNumber = Math.max(...current.versions.map((version) => version.number), 0) + (currentVersion.state === "snapshot" ? 1 : 0);
    const versionId = currentVersion.state === "snapshot" ? crypto.randomUUID() : currentVersion.id;
    const versionState = parsed.data.publish ? "snapshot" : "draft";
    const versionPayload = { ...(currentVersion.definition.version as object), ...currentVersion.definition.version, ...form.versions.find((version) => version.id === form.activeVersionId), id: versionId, formId, organizationId: auth.organizationId, clientId: form.clientId, number: nextNumber, state: versionState };
    if (currentVersion.state === "snapshot") {
      const { error } = await auth.supabase.from("atendhub_form_versions").insert({ id: versionId, form_id: formId, organization_id: auth.organizationId, client_id: form.clientId, number: nextNumber, state: versionState, definition: { version: versionPayload, fields: form.fields ?? [] }, paths: versionPayload.paths ?? [], choice_assets: form.fields.flatMap((field) => field.options.filter((option) => option.imageUrl).map((option) => ({ id: option.id, imageUrl: option.imageUrl, alt: option.alt }))), created_by_id: auth.userId });
      if (error) throw error;
    } else {
      const { error } = await auth.supabase.from("atendhub_form_versions").update({ state: versionState, definition: { version: versionPayload, fields: form.fields ?? [] }, paths: versionPayload.paths ?? [], choice_assets: form.fields.flatMap((field) => field.options.filter((option) => option.imageUrl).map((option) => ({ id: option.id, imageUrl: option.imageUrl, alt: option.alt }))) }).eq("id", currentVersion.id).eq("state", "draft");
      if (error) throw error;
    }
    const { data: row, error: formError } = await auth.supabase.from("atendhub_forms").update({ client_id: form.clientId, doctor_id: form.doctorId, name: form.name, description: form.description ?? "", slug: form.slug, status: parsed.data.publish ? "demo" : "draft", active_version_id: versionId, updated_at: new Date().toISOString() }).eq("id", formId).eq("organization_id", auth.organizationId).select("id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id").single();
    if (formError || !row) throw formError ?? new Error("Formulário não atualizado.");
    const fresh = await load(auth, formId);
    return NextResponse.json(mapForm(fresh.row, fresh.versions));
  } catch (error) { return apiError(error, 409); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ formId: string }> }) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try { const { error } = await auth.supabase.from("atendhub_forms").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", (await context.params).formId).eq("organization_id", auth.organizationId); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { return apiError(error, 409); }
}
