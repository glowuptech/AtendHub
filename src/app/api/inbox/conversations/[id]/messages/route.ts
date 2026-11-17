import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import {
  InboxError,
  listMessages,
  sendInboxMessage,
} from "@/features/inbox/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const sendSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(6000),
});

function failure(error: unknown, fallback: string) {
  const known = error instanceof InboxError;
  return NextResponse.json(
    { error: known ? error.message : fallback },
    { status: known ? error.status : 500 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const id = idSchema.safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
  const before = new URL(request.url).searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before)))
    return NextResponse.json({ error: "Cursor inválido." }, { status: 400 });
  try {
    return NextResponse.json(await listMessages(auth, id.data, before), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "Não foi possível carregar as mensagens.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const id = idSchema.safeParse((await params).id);
  const body = sendSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success)
    return NextResponse.json(
      { error: "Informe uma mensagem de 1 a 6.000 caracteres." },
      { status: 400 },
    );
  try {
    const result = await sendInboxMessage(auth, {
      conversationId: id.data,
      requestId: body.data.requestId,
      body: body.data.body,
    });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return failure(error, "Não foi possível enviar a mensagem.");
  }
}
