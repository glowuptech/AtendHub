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
