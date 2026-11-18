import { NextResponse } from "next/server";
import { z } from "zod";
import {
  askAssistant,
  AssistantError,
  getAssistantHistory,
} from "@/features/inbox/assistant-server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const idSchema = z.string().uuid();
const requestSchema = z
  .object({
    requestId: z.string().uuid(),
    threadId: z.string().uuid().optional(),
    question: z.string().trim().min(1).max(2000),
  })
  .strict();

function failure(error: unknown, fallback: string) {
  const known = error instanceof AssistantError;
  return NextResponse.json(
    { error: known ? error.message : fallback },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const conversationId = idSchema.safeParse((await params).id);
  if (!conversationId.success)
    return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
  const before = new URL(request.url).searchParams.get("before") ?? undefined;
  try {
    const history = await getAssistantHistory(auth, conversationId.data, before);
    return NextResponse.json(history, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "Não foi possível carregar o histórico do assistente.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const conversationId = idSchema.safeParse((await params).id);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!conversationId.success || !body.success)
    return NextResponse.json(
      { error: "Informe uma pergunta de até 2.000 caracteres e um requestId válido." },
      { status: 400 },
    );
  try {
    const result = await askAssistant(auth, {
      conversationId: conversationId.data,
      requestId: body.data.requestId,
      question: body.data.question,
      threadId: body.data.threadId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "Não foi possível consultar o assistente.");
  }
}
