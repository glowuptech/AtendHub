import { NextResponse } from "next/server";
import { z } from "zod";
import { KnowledgeEntrySchema } from "@/domain/schemas";
import { canAccessKnowledge } from "@/features/clients/knowledge-server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export const dynamic = "force-dynamic";

const clientIdSchema = z.string().uuid();
const knowledgeSchema = z.array(KnowledgeEntrySchema).max(200);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const clientId = clientIdSchema.safeParse((await params).clientId);
  if (!clientId.success)
    return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

  try {
    if (!(await canAccessKnowledge(auth, "view")))
      return NextResponse.json({ error: "Acesso negado à base de conhecimento." }, { status: 403 });
    const { data, error } = await auth.supabase
      .from("atendhub_clients")
      .select("metadata")
      .eq("id", clientId.data)
      .eq("organization_id", auth.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const parsed = knowledgeSchema.safeParse(
      (data.metadata as { knowledge?: unknown } | null)?.knowledge ?? [],
    );
    if (!parsed.success)
      return NextResponse.json({ error: "A base deste cliente contém dados inválidos." }, { status: 500 });
    return NextResponse.json(
      {
        knowledge: parsed.data,
        canEdit: await canAccessKnowledge(auth, "edit"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar a base de conhecimento." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const clientId = clientIdSchema.safeParse((await params).clientId);
  const body = z
    .object({ knowledge: knowledgeSchema })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!clientId.success || !body.success)
    return NextResponse.json(
      { error: "Confira os itens da base e tente novamente." },
      { status: 400 },
    );

  try {
    if (!(await canAccessKnowledge(auth, "edit")))
      return NextResponse.json({ error: "Você não tem permissão para editar esta base." }, { status: 403 });
    const { data, error } = await auth.supabase.rpc(
      "atendhub_update_client_knowledge",
      { p_client_id: clientId.data, p_knowledge: body.data.knowledge },
    );
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 500;
      return NextResponse.json(
        { error: status === 403 ? "Você não tem permissão para editar esta base." : "Não foi possível salvar a base de conhecimento." },
        { status },
      );
    }
    return NextResponse.json(
      { knowledge: data, canEdit: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível salvar a base de conhecimento." },
      { status: 500 },
    );
  }
}
