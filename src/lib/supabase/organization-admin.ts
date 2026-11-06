import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function organizationContext() {
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
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) return { error: NextResponse.json({ error: "Configuração segura incompleta." }, { status: 500 }) } as const;
  const admin = createAdminClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  return { admin, userId: user.id, organizationId: membership.organization_id as string, role: membership.role as string } as const;
}

export function apiError(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação." }, { status });
}
