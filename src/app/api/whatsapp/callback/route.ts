import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { integrationAdmin } from "@/features/whatsapp/server";
const schema = z.object({
  connectionId: z.string().uuid(),
  eventId: z.string().uuid(),
  status: z.enum([
    "connected",
    "disconnected",
    "error",
    "deleted",
    "awaiting_confirmation",
  ]),
});
export async function POST(request: Request) {
  const secret = process.env.ATENDHUB_WHATSAPP_CALLBACK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Callback não configurado." },
      { status: 503 },
    );
  const timestamp = request.headers.get("x-atendhub-timestamp") ?? "";
  const signature = request.headers.get("x-atendhub-signature") ?? "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return NextResponse.json(
      { error: "Assinatura inválida." },
      { status: 401 },
    );
  const raw = await request.text();
  if (raw.length > 4096)
    return NextResponse.json({ error: "Payload inválido." }, { status: 413 });
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + raw)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    return NextResponse.json(
      { error: "Assinatura inválida." },
      { status: 401 },
    );
  let input;
  try {
    input = schema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!input.success)
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  try {
    const { connectionId, eventId, status } = input.data;
    const { data, error } = await integrationAdmin().rpc(
      "atendhub_whatsapp_callback",
      { p_connection_id: connectionId, p_event_id: eventId, p_status: status },
    );
    if (error)
      return NextResponse.json(
        { error: "Transição não permitida." },
        { status: 409 },
      );
    return NextResponse.json({ applied: data });
  } catch {
    return NextResponse.json(
      { error: "Integração indisponível." },
      { status: 503 },
    );
  }
}
