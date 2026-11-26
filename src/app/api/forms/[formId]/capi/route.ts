import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { integrationAdmin } from "@/features/whatsapp/server";
import {
  accessEncryptionConfigured,
  sealPassword,
} from "@/features/clients/accesses/crypto";

type Context = { params: Promise<{ formId: string }> };
async function manage(request: Request, context: Context) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin")
    return Response.json(
      { error: "Acesso restrito ao administrador." },
      { status: 403 },
    );
  const { formId } = await context.params;
  const { data: form } = await auth.supabase
    .from("atendhub_forms")
    .select("id")
    .eq("id", formId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (!form)
    return Response.json(
      { error: "Formulário indisponível." },
      { status: 404 },
    );
  const table = integrationAdmin().from("atendhub_form_capi");
  const failed = () =>
    Response.json(
      { error: "Configuração da API de Conversões indisponível." },
      { status: 503 },
    );
  if (request.method === "GET") {
    const { data, error } = await table
      .select("pixel_id,test_code")
      .eq("form_id", formId)
      .maybeSingle();
    return error
      ? failed()
      : Response.json({ pixel: data?.pixel_id, testCode: data?.test_code });
  }
  if (request.method === "DELETE") {
    const { error } = await table.delete().eq("form_id", formId);
    return error ? failed() : Response.json({ ok: true });
  }
  const parsed = z
    .object({
      pixel: z.string().regex(/^\d{5,30}$/),
      token: z.string().trim().max(8192),
      testCode: z.string().trim().max(100),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Confira o Pixel e a credencial." },
      { status: 400 },
    );
  const { token, pixel, testCode } = parsed.data;
  if (!token) {
    const { data, error } = await table
      .update({ test_code: testCode || null })
      .eq("form_id", formId)
      .eq("pixel_id", pixel)
      .select("form_id")
      .maybeSingle();
    if (error) return failed();
    return data
      ? Response.json({ ok: true })
      : Response.json(
          { error: "Informe o token deste Pixel." },
          { status: 400 },
        );
  }
  if (!accessEncryptionConfigured()) return failed();
  const { error } = await table.upsert({
    form_id: formId,
    pixel_id: pixel,
    secret: sealPassword(token, `form-capi:${formId}:${pixel}`),
    test_code: testCode || null,
  });
  return error ? failed() : Response.json({ ok: true });
}
export { manage as GET, manage as PUT, manage as DELETE };
