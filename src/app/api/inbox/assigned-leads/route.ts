import { NextResponse } from "next/server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { integrationAdmin } from "@/features/whatsapp/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try {
    const { data: leads, error } = await auth.supabase
      .from("atendhub_leads")
      .select("id,name,phone,client_id,stage")
      .eq("organization_id", auth.organizationId)
      .eq("owner_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    if (!leads?.length) return NextResponse.json([]);
    const clientIds = [...new Set(leads.map((l) => l.client_id))];
    const [conversations, clients, connections] = await Promise.all([
      auth.supabase
        .from("atendhub_inbox_conversations")
        .select("lead_id")
        .eq("organization_id", auth.organizationId)
        .in(
          "lead_id",
          leads.map((l) => l.id),
        ),
      auth.supabase
        .from("atendhub_clients")
        .select("id,name,operation_id")
        .eq("organization_id", auth.organizationId)
        .in("id", clientIds),
      integrationAdmin()
        .from("atendhub_whatsapp_connections")
        .select("id,client_id,name,phone,status")
        .eq("organization_id", auth.organizationId)
        .in("client_id", clientIds)
        .not("status", "in", "(deleted,delete_pending)"),
    ]);
    if (conversations.error || clients.error || connections.error)
      throw new Error("LOAD_FAILED");
    const operationIds = [
      ...new Set((clients.data ?? []).map((c) => c.operation_id)),
    ];
    const { data: operations, error: opError } = operationIds.length
      ? await auth.supabase
          .from("atendhub_operations")
          .select("id,code,name")
          .in("id", operationIds)
      : { data: [], error: null };
    if (opError) throw opError;
    const existing = new Set((conversations.data ?? []).map((c) => c.lead_id));
    return NextResponse.json(
      leads.flatMap((lead) => {
        const client = clients.data?.find((c) => c.id === lead.client_id);
        if (!client || existing.has(lead.id)) return [];
        const op = operations?.find((o) => o.id === client.operation_id);
        return [
          {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            stage: lead.stage,
            clientId: client.id,
            clientName: client.name,
            operationCode: op?.code ?? "",
            operationName: op?.name ?? "",
            connections: (connections.data ?? [])
              .filter((c) => c.client_id === client.id)
              .map(({ id, name, phone, status }) => ({
                id,
                name,
                phone,
                status,
              })),
          },
        ];
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível carregar seus atendimentos sem conversa. Tente novamente.",
      },
      { status: 500 },
    );
  }
}
