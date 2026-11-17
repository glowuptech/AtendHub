import { NextResponse } from "next/server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { InboxError, listConversations } from "@/features/inbox/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await listConversations(auth), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof InboxError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof InboxError
            ? error.message
            : "Não foi possível carregar as conversas.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { z } = await import("zod");
  const parsed = z
    .object({ leadId: z.string().uuid(), connectionId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Selecione o atendimento e uma conexão válida." },
      { status: 400 },
    );
  const { data, error } = await auth.supabase.rpc(
    "atendhub_inbox_start_conversation",
    {
      p_lead_id: parsed.data.leadId,
      p_connection_id: parsed.data.connectionId,
    },
  );
  if (error) {
    const message = error.message ?? "";
    const explanation =
      error.code === "42501"
        ? "Você precisa ser o responsável atual por este lead e ter acesso ao cliente."
        : message.includes("INVALID_PHONE")
          ? "Corrija o telefone do lead antes de abrir a conversa."
          : message.includes("SELF_PHONE")
            ? "O telefone do lead é igual ao número comercial da conexão."
            : message.includes("CONVERSATION_LEAD_CONFLICT")
              ? "Este número já tem uma conversa vinculada a outro lead. Revise o vínculo antes de continuar."
              : "Não foi possível abrir a conversa. Confira a conexão e a ativação desta função no servidor.";
    return NextResponse.json(
      { error: explanation },
      { status: error.code === "42501" ? 403 : 409 },
    );
  }
  return NextResponse.json({ id: data });
}
