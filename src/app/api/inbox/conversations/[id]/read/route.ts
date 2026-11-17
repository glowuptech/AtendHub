import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { InboxError, markConversationRead } from "@/features/inbox/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!id.success)
    return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
  try {
    await markConversationRead(auth, id.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const known = error instanceof InboxError;
    return NextResponse.json(
      {
        error: known ? error.message : "Não foi possível atualizar a leitura.",
      },
      { status: known ? error.status : 500 },
    );
  }
}
