import { NextResponse } from "next/server";
import { z } from "zod";
import {
  emptyRegistration,
  registrationSchema,
} from "@/features/leads/registration/model";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
const response = (
  data: ReturnType<typeof emptyRegistration>,
  canEdit: boolean,
) =>
  NextResponse.json(
    { supported: true, canEdit, data },
    { headers: { "Cache-Control": "no-store, private" } },
  );

async function getLeadAccess(
  auth: Exclude<
    Awaited<ReturnType<typeof sessionOrganizationContext>>,
    { error: unknown }
  >,
  leadId: string,
) {
  const { data: lead, error } = await auth.supabase
    .from("atendhub_leads")
    .select("id,organization_id,client_id")
    .eq("id", leadId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (error || !lead)
    return {
      error: NextResponse.json(
        { error: "Lead não encontrado neste cliente." },
        { status: 404 },
      ),
    } as const;
  const { data: canView, error: viewError } = await auth.supabase.rpc(
    "atendhub_booking_details_can_access",
    {
      _org: lead.organization_id,
      _client: lead.client_id,
      _lead: lead.id,
      _action: "view",
    },
  );
  if (viewError || canView !== true)
    return {
      error: NextResponse.json(
        { error: "Você não tem acesso a estes dados." },
        { status: 403 },
      ),
    } as const;
  const { data: canEdit } = await auth.supabase.rpc(
    "atendhub_booking_details_can_access",
    {
      _org: lead.organization_id,
      _client: lead.client_id,
      _lead: lead.id,
      _action: "edit",
    },
  );
  return { lead, canEdit: canEdit === true } as const;
}

function missingTable(error: { code?: string } | null) {
  return ["42P01", "PGRST205"].includes(error?.code ?? "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  if (!idSchema.safeParse(leadId).success)
    return NextResponse.json({ error: "Lead inválido." }, { status: 400 });
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const access = await getLeadAccess(auth, leadId);
  if ("error" in access) return access.error;
  const { data: row, error } = await auth.supabase
    .from("atendhub_lead_registration")
    .select("full_name,cpf,rg,birth_date")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (missingTable(error))
    return NextResponse.json(
      { supported: false, canEdit: false, data: emptyRegistration() },
      { status: 501 },
    );
  if (error)
    return NextResponse.json(
      { error: "Não foi possível carregar os dados pessoais." },
      { status: 500 },
    );
  return response(
    {
      fullName: row?.full_name ?? "",
      cpf: row?.cpf ?? "",
      rg: row?.rg ?? "",
      birthDate: row?.birth_date ?? "",
    },
    access.canEdit,
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  if (!idSchema.safeParse(leadId).success)
    return NextResponse.json({ error: "Lead inválido." }, { status: 400 });
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const access = await getLeadAccess(auth, leadId);
  if ("error" in access) return access.error;
  if (!access.canEdit)
    return NextResponse.json(
      { error: "Você não tem permissão para editar estes dados." },
      { status: 403 },
    );
  const parsed = registrationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Confira os dados informados.",
      },
      { status: 400 },
    );
  const value = parsed.data;
  const payload = {
    lead_id: access.lead.id,
    organization_id: access.lead.organization_id,
    client_id: access.lead.client_id,
    full_name: value.fullName || null,
    cpf: value.cpf || null,
    rg: value.rg || null,
    birth_date: value.birthDate || null,
    updated_by_id: auth.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.supabase
    .from("atendhub_lead_registration")
    .upsert(payload, { onConflict: "lead_id" });
  if (missingTable(error))
    return NextResponse.json(
      { error: "O cadastro ainda não está disponível no servidor." },
      { status: 501 },
    );
  if (error)
    return NextResponse.json(
      { error: "Não foi possível salvar os dados pessoais." },
      { status: error.code === "42501" ? 403 : 500 },
    );
  const { data: saved, error: readError } = await auth.supabase
    .from("atendhub_lead_registration")
    .select("full_name,cpf,rg,birth_date")
    .eq("lead_id", leadId)
    .single();
  if (readError || !saved)
    return NextResponse.json(
      { error: "Não foi possível confirmar os dados salvos." },
      { status: 500 },
    );
  return response(
    {
      fullName: saved.full_name ?? "",
      cpf: saved.cpf ?? "",
      rg: saved.rg ?? "",
      birthDate: saved.birth_date ?? "",
    },
    true,
  );
}
