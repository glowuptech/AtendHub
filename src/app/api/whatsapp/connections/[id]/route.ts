import { NextResponse } from "next/server";
import { z } from "zod";
import {
  whatsappAuth,
  dispatchConnectionEvent,
} from "@/features/whatsapp/server";
import { actionSchema } from "@/features/whatsapp/model";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await whatsappAuth();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Conexão inválida." }, { status: 400 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (
    !parsed.success ||
    (parsed.data.action === "update" && !parsed.data.phone)
  )
    return NextResponse.json(
      { error: "Revise a ação e o telefone." },
      { status: 400 },
    );
  const p = parsed.data;
  let eventId: string;
  if (p.action === "retry") {
    const { data, error } = await auth.supabase
      .from("atendhub_whatsapp_connections")
      .select("last_event_id")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error || !data?.last_event_id)
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    eventId = data.last_event_id;
  } else {
    const { data, error } = await auth.supabase.rpc(
      "atendhub_whatsapp_command",
      {
        p_action: p.action,
        p_request_id: p.requestId,
        p_connection_id: id,
        p_phone: p.phone ? "55" + p.phone : null,
      },
    );
    if (error)
      return NextResponse.json(
        {
          error:
            "Não foi possível solicitar esta ação. Se o evento anterior ainda não foi recebido pelo n8n, use Reenviar evento antes de solicitar outra ação.",
        },
        { status: 409 },
      );
    eventId = data.eventId;
  }
  let delivery = "retry";
  try {
    delivery = await dispatchConnectionEvent(auth, eventId);
  } catch {
    /* Event is durable, never report connection as established here. */
  }
  return NextResponse.json({ eventId, delivery });
}
