import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { persistedForm } from "@/features/forms/services/persisted-form";
import { FormSchema } from "@/domain/schemas";
import { duplicateForm } from "@/features/forms/services/duplicate-form";
import {
  saveForm,
  writeFormVersion,
} from "@/features/forms/services/save-form";

async function load(
  auth: Exclude<
    Awaited<ReturnType<typeof sessionOrganizationContext>>,
    { error: unknown }
  >,
  formId: string,
) {
  const { data: row, error } = await auth.supabase
    .from("atendhub_forms")
    .select(
      "id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id,updated_at",
    )
    .eq("id", formId)
    .eq("organization_id", auth.organizationId)
    .single();
  if (error || !row) throw error ?? new Error("Formulário não encontrado.");
  const { data: versions, error: versionError } = await auth.supabase
    .from("atendhub_form_versions")
    .select(
      "id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets",
    )
    .eq("form_id", formId)
    .order("number");
  if (versionError) throw versionError;
  return { row, versions: versions ?? [] };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try {
    const data = await load(auth, (await context.params).formId);
    return NextResponse.json(persistedForm(data.row, data.versions));
  } catch (error) {
    return apiError(error, 404);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { formId } = await context.params;
  const input = z
    .object({
      action: z.literal("duplicate"),
      copyId: z.uuid(),
      versionId: z.uuid(),
    })
    .safeParse(await request.json().catch(() => null));
  if (
    !input.success ||
    !z.uuid().safeParse(formId).success ||
    input.data.copyId === formId
  ) {
    return NextResponse.json(
      { error: "Solicitação de cópia inválida." },
      { status: 400 },
    );
  }
  try {
    const { row, versions } = await load(auth, formId);
    const source = persistedForm(row, versions);
    const selected = source.versions.find(
      (v) => v.id === source.activeVersionId,
    );
    const parsed = FormSchema.safeParse({ ...source, versions: [selected] });
    if (!parsed.success)
      return NextResponse.json(
        { error: "Não foi possível ler a versão do formulário." },
        { status: 422 },
      );
    const copy = duplicateForm(
      parsed.data,
      input.data.copyId,
      input.data.versionId,
    );
    const { error } = await writeFormVersion(
      auth.supabase,
      copy,
      copy.versions[0],
      true,
      false,
    );
    if (error?.code === "23505") {
      // A response can be lost after the transaction commits. Reopen that same copy on retry.
      const previous = await auth.supabase
        .from("atendhub_form_versions")
        .select("id")
        .eq("organization_id", auth.organizationId)
        .eq("client_id", copy.clientId)
        .eq("form_id", copy.id)
        .eq("id", copy.activeVersionId)
        .maybeSingle();
      if (previous.data) return NextResponse.json({ id: copy.id });
    }
    if (error) return apiError(error, 409);
    return NextResponse.json({ id: copy.id }, { status: 201 });
  } catch (cause) {
    return apiError(cause, 400);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  return saveForm(request, (await context.params).formId);
}

// Restore never republishes an archived form. Versions and answers remain untouched.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { formId } = await context.params;
  if (!z.string().uuid().safeParse(formId).success)
    return NextResponse.json(
      { error: "Formulário inválido." },
      { status: 400 },
    );
  const action = z
    .object({ action: z.literal("restore") })
    .safeParse(await request.json().catch(() => null));
  if (!action.success)
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  try {
    const { data, error } = await auth.supabase
      .from("atendhub_forms")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", formId)
      .eq("organization_id", auth.organizationId)
      .eq("status", "archived")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        {
          error:
            "O formulário não está arquivado ou você não tem permissão para recuperá-lo. Atualize a lista.",
        },
        { status: 409 },
      );
    return NextResponse.json({ ok: true, status: "draft" });
  } catch (error) {
    return apiError(error, 409);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { formId } = await context.params;
  if (!z.string().uuid().safeParse(formId).success)
    return NextResponse.json(
      { error: "Formulário inválido." },
      { status: 400 },
    );
  try {
    const { data, error } = await auth.supabase
      .from("atendhub_forms")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", formId)
      .eq("organization_id", auth.organizationId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        {
          error:
            "Não foi possível arquivar o formulário. Atualize a lista e confira seu acesso.",
        },
        { status: 409 },
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 409);
  }
}
