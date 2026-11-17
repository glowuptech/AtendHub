import { NextResponse } from "next/server";
import {
  whatsappAuth,
  dispatchConnectionEvent,
} from "@/features/whatsapp/server";
import { createConnectionSchema } from "@/features/whatsapp/model";
import { apiError } from "@/lib/supabase/organization-admin";
export async function GET() {
  const auth = await whatsappAuth();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("atendhub_whatsapp_connections")
    .select(
      "id,client_id,name,instance_name,phone,status,last_event_id,updated_at",
    )
    .eq("organization_id", auth.organizationId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  if (error) return apiError(error, 500, { stage: "whatsapp-list" });
  return NextResponse.json(data);
}
export async function POST(request: Request) {
  const auth = await whatsappAuth();
  if ("error" in auth) return auth.error;
  const parsed = createConnectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const p = parsed.data;
  const { data, error } = await auth.supabase.rpc("atendhub_whatsapp_command", {
    p_action: "create",
    p_request_id: p.requestId,
    p_client_id: p.clientId,
    p_name: p.name,
    p_phone: "55" + p.phone,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "Este nome de instância já está em uso. Escolha outro nome."
            : "Não foi possível cadastrar a conexão. Verifique o cliente e suas permissões.",
      },
      { status: 409 },
    );
  let delivery = "retry";
  try {
    delivery = await dispatchConnectionEvent(auth, data.eventId);
  } catch {
    /* Keep persisted event available for retry. */
  }
  return NextResponse.json({ ...data, delivery }, { status: 201 });
}
