import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tenantSlug } from "./model";
import { tenantAtHost } from "./server";

export async function brandedPortalContext() {
  const host = (await headers()).get("host");
  if (!tenantSlug(host)) return null;
  const clientId = await tenantAtHost(host);
  if (!clientId) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendhub_clients")
    .select("id,name,organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) notFound();
  return { client: data, supabase };
}
export function BrandedPortalHeader({ name }: { name: string }) {
  return (
    <header>
      <h1>{name}</h1>
      <nav aria-label="Portal">
        <a href="/portal">Início</a>
        {" · "}
        <a href="/portal/agendamentos">Agendamentos</a>
        {" · "}
        <a href="/portal/trafego-pago">Tráfego pago</a>
      </nav>
    </header>
  );
}
