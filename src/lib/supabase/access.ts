import { redirect } from "next/navigation";

import { appHomePath } from "@/features/auth/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAtendhubMembership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${appHomePath}`);

  const { data: membership } = await supabase
    .from("atendhub_team_members")
    .select("id, organization_id, role, status, display_name, client_access_mode")
    .eq("id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) redirect("/acesso-negado");

  return { user, membership };
}
