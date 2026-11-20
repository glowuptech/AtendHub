import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { integrationAdmin } from "@/features/whatsapp/server";
import {
  rootDomain,
  panelDomain,
  reserved,
  slugPattern,
} from "@/features/client-domains/model";
import { publicOrigin } from "@/features/client-domains/server";

type Context = { params: Promise<{ clientId: string }> };
const config = {
  rootDomain,
  panelDomain,
  dnsTarget: process.env.ATENDHUB_DNS_TARGET?.trim() || null,
};
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const input = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugPattern)
    .refine((slug) => !reserved.includes(slug)),
  active: z.boolean(),
});

async function route(request: Request, context: Context) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { clientId } = await context.params;
  if (!z.string().uuid().safeParse(clientId).success)
    return json({ error: "Cliente inválido." }, 400);
  const { data: client, error: accessError } = await auth.supabase
    .from("atendhub_clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (accessError)
    return json(
      { error: "Não foi possível conferir o acesso ao cliente." },
      500,
    );
  if (!client) return json({ error: "Cliente indisponível." }, 404);
  const admin = integrationAdmin();
  const canEdit = auth.role === "super_admin";
  const table = admin.from("atendhub_client_domains");
  const current = await table
    .select("slug,active")
    .eq("client_id", clientId)
    .maybeSingle();
  if (current.error)
    return json(
      { error: "Não foi possível consultar o domínio do cliente." },
      503,
    );
  if (request.method === "GET")
    return json({
      ...config,
      canEdit,
      domain: current.data,
      origin: publicOrigin(current.data),
    });
  if (!canEdit)
    return json(
      { error: "Somente superadministradores podem editar o domínio." },
      403,
    );
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json(
      { error: "Escolha um subdomínio válido e disponível para clientes." },
      400,
    );
  const { slug, active } = parsed.data;
  if (active && current.data?.slug !== slug)
    return json(
      {
        error: "Salve o subdomínio e configure a hospedagem antes de ativá-lo.",
      },
      409,
    );
  const { error } = await table.upsert(
    { client_id: clientId, organization_id: auth.organizationId, slug, active },
    { onConflict: "client_id" },
  );
  if (error?.code === "23505")
    return json({ error: "Esse subdomínio já está em uso." }, 409);
  if (error) return json({ error: "Não foi possível salvar o domínio." }, 500);
  return json({
    ...config,
    canEdit,
    domain: { slug, active },
    origin: publicOrigin({ slug, active }),
  });
}
export const GET = route;
export const PUT = route;
