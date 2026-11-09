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
  return { supabase, admin, userId: user.id, organizationId: membership.organization_id as string, role: membership.role as string } as const;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { code: "UNKNOWN" };
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "UNKNOWN",
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

export function apiError(error: unknown, status = 400, context?: { requestId?: string; stage?: string }) {
  const requestId = context?.requestId ?? crypto.randomUUID();
  const stage = context?.stage ?? "request";
  const details = errorDetails(error);
  console.error("[v0] atendhub-api-error", { requestId, stage, code: details.code });
  const userMessage = status >= 500 ? "Não foi possível concluir a operação. Informe o código de suporte." : "Não foi possível salvar as alterações. Confira os dados e informe o código de suporte.";
  return NextResponse.json({ error: userMessage, supportId: requestId, code: details.code }, { status });
}
