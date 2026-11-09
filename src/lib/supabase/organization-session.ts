import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function sessionOrganizationContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) } as const;
  const { data: membership, error } = await supabase
    .from("atendhub_team_members")
    .select("id, organization_id, role, status")
    .eq("id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership) return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) } as const;
  return { supabase, userId: user.id, organizationId: membership.organization_id as string, role: membership.role as string } as const;
}
