import { NextResponse } from "next/server";
import { authorizeClient, noStore } from "@/features/clients/accesses/server";
import { schedulingSchema } from "@/features/clients/accesses/model";
type Context = { params: Promise<{ clientId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const auth = await authorizeClient((await params).clientId);
  if ("error" in auth) return auth.error;
  const m = auth.client.metadata as Record<string, unknown> | null;
  const url =
    typeof m?.externalSchedulingUrl === "string" &&
    m.externalSchedulingUrl !== "https://example.com/agenda-demo"
      ? m.externalSchedulingUrl
      : "";
  return NextResponse.json(
    {
      name: m?.externalSchedulingName ?? "",
      url,
      canEdit: auth.role === "super_admin",
    },
    { headers: noStore },
  );
}
export async function PUT(request: Request, { params }: Context) {
  const { clientId } = await params;
  const auth = await authorizeClient(clientId, true);
  if ("error" in auth) return auth.error;
  const parsed = schedulingSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const { error } = await auth.supabase.rpc(
    "atendhub_update_external_scheduling",
    { p_client_id: clientId, p_name: parsed.data.name, p_url: parsed.data.url },
  );
  if (error)
    return NextResponse.json(
      { error: "Não foi possível salvar a plataforma de agendamento." },
      { status: 409 },
    );
  return NextResponse.json(
    { ...parsed.data, canEdit: true },
    { headers: noStore },
  );
}
