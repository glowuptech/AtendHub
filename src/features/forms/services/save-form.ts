import { NextResponse } from "next/server";
import { z } from "zod";
import { FormSchema } from "@/domain/schemas";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { apiError } from "@/lib/supabase/organization-admin";
import { validateRouting } from "./routing";
import { completionMessage } from "./completion";
import { persistedForm } from "./persisted-form";

const input = z.object({
  form: FormSchema,
  publish: z.boolean().default(false),
  expectedUpdatedAt: z.iso.datetime({ offset: true }).nullish(),
});

export async function saveForm(request: Request, existingId?: string) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confira o nome, o endereço e as perguntas do formulário." },
      { status: 400 },
    );
  const { form, publish, expectedUpdatedAt } = parsed.data;
  const version = form.versions.find((v) => v.id === form.activeVersionId);
  if (
    !version ||
    (existingId && form.id !== existingId) ||
    auth.organizationId !== form.organizationId
  )
    return NextResponse.json(
      { error: "Formulário ou versão inválida." },
      { status: 400 },
    );
  if (publish) {
    try {
      validateRouting(version, form.fields);
      version.successMessage = completionMessage(version.successMessage);
      if (version.settings) version.settings.enabled = true;
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Revise os caminhos.",
        },
        { status: 422 },
      );
    }
  }
  const { id, clientId, name, slug, description, doctorId, fields } = form;
  const { data, error } = await auth.supabase.rpc(
    "atendhub_save_form_version",
    {
      p_org: auth.organizationId,
      p_client: clientId,
      p_form: id,
      p_create: !existingId,
      p_details: { name, slug, description, doctorId },
      p_version: version,
      p_fields: fields,
      p_publish: publish,
      p_expected_update: expectedUpdatedAt ?? null,
    },
  );
  if (error) {
    if (error.code === "40001" || error.code === "23505")
      return NextResponse.json(
        {
          error:
            error.code === "40001"
              ? "O formulário mudou. Reabra o editor antes de salvar."
              : "O endereço ou a versão já está em uso. Confira o formulário antes de salvar.",
        },
        { status: 409 },
      );
    return apiError(error, 409);
  }
  return NextResponse.json(persistedForm(data.form, data.versions), {
    status: existingId ? 200 : 201,
  });
}
