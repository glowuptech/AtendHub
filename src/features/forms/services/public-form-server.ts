import "server-only";
import { FormSchema } from "@/domain/schemas";
import { tenantSlug } from "@/features/client-domains/model";
import { tenantAtHost } from "@/features/client-domains/server";
import { integrationAdmin } from "@/features/whatsapp/server";
import { persistedForm } from "./persisted-form";

export async function loadPublicForm(slug: string, host: string | null) {
  const tenant = tenantSlug(host) ? await tenantAtHost(host) : undefined;
  if (tenant === null) return null;
  const supabase = integrationAdmin();
  let query = supabase
    .from("atendhub_forms")
    .select(
      "id,organization_id,client_id,doctor_id,name,description,slug,status,active_version_id",
    )
    .eq("slug", slug)
    .eq("status", "demo");
  if (tenant) query = query.eq("client_id", tenant);
  const { data: row, error } = await query.maybeSingle();
  if (error || !row) return null;
  const [snapshot, client] = await Promise.all([
    supabase
      .from("atendhub_form_versions")
      .select(
        "id,form_id,organization_id,client_id,number,state,definition,paths,choice_assets",
      )
      .eq("form_id", row.id)
      .eq("id", row.active_version_id)
      .eq("state", "snapshot")
      .limit(1),
    supabase
      .from("atendhub_clients")
      .select("name")
      .eq("id", row.client_id)
      .maybeSingle(),
  ]);
  if (snapshot.error || !snapshot.data?.length) return null;
  const parsed = FormSchema.safeParse(persistedForm(row, snapshot.data, false));
  if (!parsed.success || parsed.data.versions[0].settings?.enabled === false)
    return null;
  return { ...parsed.data, clinicName: client.data?.name ?? row.name };
}
