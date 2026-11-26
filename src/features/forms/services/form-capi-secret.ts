import "server-only";
import { integrationAdmin } from "@/features/whatsapp/server";
import { openPassword } from "@/features/clients/accesses/crypto";

export async function formCapiSecret(formId: string, pixel: string) {
  const { data } = await integrationAdmin()
    .from("atendhub_form_capi")
    .select("secret,test_code")
    .eq("form_id", formId)
    .eq("pixel_id", pixel)
    .maybeSingle();
  if (!data) return null;
  return {
    token: openPassword(data.secret, `form-capi:${formId}:${pixel}`),
    testCode: data.test_code || undefined,
  };
}
