import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
export const noStore = { "Cache-Control": "no-store" };
export async function authorizeClient(id: string, write = false) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return { error: auth.error! } as const;
  if (!z.string().uuid().safeParse(id).success)
    return {
      error: NextResponse.json({ error: "Cliente inválido." }, { status: 400 }),
    } as const;
  if (write && auth.role !== "super_admin")
    return {
      error: NextResponse.json(
        {
          error: "Somente superadministradores podem gerenciar este cadastro.",
        },
        { status: 403 },
      ),
    } as const;
  const { data, error } = await auth.supabase
    .from("atendhub_clients")
    .select("id,metadata")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (error || !data)
    return {
      error: NextResponse.json(
        { error: "Cliente não encontrado ou sem acesso." },
        { status: 404 },
      ),
    } as const;
  return { ...auth, client: data };
}
export function accessAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function accessError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error && error.message === "ENCRYPTION_NOT_CONFIGURED"
          ? "O cofre de senhas precisa ser ativado no servidor antes de salvar ou revelar senhas."
          : "Não foi possível concluir a operação. Verifique a ativação do cofre e tente novamente.",
    },
    { status: 503, headers: noStore },
  );
}
export const publicAccessColumns = "id,label,url,login,notes,updated_at";
