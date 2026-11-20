import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

function failure(error: { code: string; message: string }) {
  if (error.code === "PGRST202")
    return NextResponse.json(
      { error: "A confirmação da véspera aguarda ativação no banco." },
      { status: 503 },
    );
  if (error.code === "42501")
    return NextResponse.json(
      { error: "Sua conta não pode editar este agendamento." },
      { status: 403 },
    );
  if (error.message.includes("STALE_REMINDER") || error.code === "P0002")
    return NextResponse.json(
      {
        error:
          "O lembrete ou a consulta mudou. Atualize a lista antes de registrar a resposta.",
      },
      { status: 409 },
    );
  return NextResponse.json(
    { error: "Não foi possível consultar ou atualizar a confirmação." },
    { status: 500 },
  );
}
export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const client = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("clientId"));
  if (!client.success)
    return NextResponse.json(
      { error: "Selecione o cliente." },
      { status: 400 },
    );
  const { data, error } = await auth.supabase.rpc("atendhub_eve_list", {
    p_org: auth.organizationId,
    p_client: client.data,
  });
  return error
    ? failure(error)
    : NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const input = z
    .object({ id: z.string().uuid(), action: z.enum(["sent", "confirmed"]) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Lembrete inválido." }, { status: 400 });
  const { error } = await auth.supabase.rpc("atendhub_eve_phone", {
    p_org: auth.organizationId,
    p_id: input.data.id,
    p_action: input.data.action,
  });
  return error ? failure(error) : NextResponse.json({ ok: true });
}
