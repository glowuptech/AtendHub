import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("route"),
    item: z.string().uuid(),
    lead: z.string().uuid(),
  }),
  z.object({
    action: z.enum(["close", "new"]),
    id: z.string().uuid(),
    request: z.string().uuid(),
  }),
]);

function failure(code: string) {
  if (code === "PGRST202" || code === "42883")
    return NextResponse.json(
      { error: "Recursos de atendimento aguardando ativação no banco." },
      { status: 503 },
    );
  if (code === "42501")
    return NextResponse.json(
      { error: "Sua conta não pode executar esta ação neste atendimento." },
      { status: 403 },
    );
  return NextResponse.json(
    {
      error:
        "Não foi possível concluir a operação. Atualize e tente novamente.",
    },
    { status: 409 },
  );
}

export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase.rpc(
    "atendhub_inbox_review_items",
    { p_org: auth.organizationId },
  );
  return error
    ? failure(error.code)
    : NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const value = parsed.data;
  const { data, error } =
    value.action === "route"
      ? await auth.supabase.rpc("atendhub_inbox_route_review", {
          p_org: auth.organizationId,
          p_item: value.item,
          p_lead: value.lead,
        })
      : value.action === "new"
        ? await auth.supabase.rpc("atendhub_inbox_new_episode", {
            p_id: value.id,
            p_request: value.request,
          })
        : await auth.supabase.rpc("atendhub_inbox_change_episode", {
            p_id: value.id,
            p_action: value.action,
          });
  return error ? failure(error.code) : NextResponse.json({ id: data });
}
