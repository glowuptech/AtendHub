import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

function failure(error: { code: string; message: string }) {
  if (error.code === "PGRST202")
    return NextResponse.json(
      { error: "A configuração de lembretes aguarda ativação no banco." },
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
  if (new URL(request.url).searchParams.has("settings")) {
    const { data, error } = await auth.supabase.rpc(
      "atendhub_reminder_preferences",
      { p_org: auth.organizationId, p_client: client.data },
    );
    return error
      ? failure(error)
      : NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }
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
    .object({
      id: z.string().uuid(),
      action: z.enum(["sent", "confirmed", "share"]),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Lembrete inválido." }, { status: 400 });
  if (input.data.action === "share") {
    const { data, error } = await auth.supabase.rpc(
      "atendhub_confirmation_share",
      {
        p_org: auth.organizationId,
        p_id: input.data.id,
      },
    );
    if (error) return failure(error);
    if (!data)
      return NextResponse.json(
        {
          error:
            "O prazo para compartilhar este link terminou ou a consulta mudou.",
        },
        { status: 409 },
      );
    return NextResponse.json(
      data,
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const { error } = await auth.supabase.rpc("atendhub_eve_phone", {
    p_org: auth.organizationId,
    p_id: input.data.id,
    p_action: input.data.action,
  });
  return error ? failure(error) : NextResponse.json({ ok: true });
}

const preferences = z.object({
  clientId: z.string().uuid(),
  advance: z.number().int().min(1).max(10080),
  sameDay: z.number().int().min(1).max(1439),
  count: z.union([z.literal(1), z.literal(2)]),
  second: z.number().int().min(1).max(1439),
  noticeToday: z.number().int().min(1).max(1439).optional(),
});

export async function PUT(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const result = preferences.safeParse(await request.json().catch(() => null));
  if (!result.success)
    return NextResponse.json(
      {
        error: "Confira as antecedências dos envios.",
      },
      { status: 400 },
    );
  const v = result.data;
  const { data, error } = await auth.supabase.rpc(
    "atendhub_reminder_preferences",
    {
      p_org: auth.organizationId,
      p_client: v.clientId,
      p_advance: v.advance,
      p_same_day: v.sameDay,
      p_count: v.count,
      p_second: v.second,
      p_notice_today: v.noticeToday ?? v.second,
    },
  );
  return error ? failure(error) : NextResponse.json(data);
}
