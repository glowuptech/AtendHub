import { integrationAdmin } from "@/features/whatsapp/server";
import { rootDomain, tenantSlug } from "./model";

export async function tenantAtHost(
  host: string | null,
): Promise<string | null> {
  const slug = tenantSlug(host);
  if (!slug) return null;
  const { data, error } = await integrationAdmin()
    .from("atendhub_client_domains")
    .select("client_id")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.client_id ?? null;
}

export function publicOrigin(domain: { slug: string; active: boolean } | null) {
  return domain?.active ? `https://${domain.slug}.${rootDomain}` : null;
}
