import { NextResponse } from "next/server";
import { ClientSchema, type Client } from "@/domain/schemas";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

const clientInput = ClientSchema.omit({ id: true, organizationId: true });
const serialize = (row: { id: string; organization_id: string; name: string; status: string; metadata: unknown }, doctors: Client["doctors"]): Client => ClientSchema.parse({ ...(row.metadata as object), id: row.id, organizationId: row.organization_id, name: row.name, status: row.status, doctors });
// Supabase schema types are not generated in this project yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveOperation = async (admin: any, organizationId: string, client: Client) => {
  const code = client.branding === "prescrita" ? "prescrita" : "veredite";
  const { data, error } = await admin.from("atendhub_operations").select("id").eq("organization_id", organizationId).eq("code", code).maybeSingle();
  if (error || !data) throw error ?? new Error(`Operação ${code} não encontrada.`);
  return data.id as string;
};

export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try {
    let query = auth.supabase
      .from("atendhub_clients")
      .select("id, organization_id, name, status, metadata")
      .eq("organization_id", auth.organizationId)
      .order("name");
    if (auth.role !== "super_admin") {
      const { data: access, error: accessError } = await auth.supabase
        .from("atendhub_team_client_access")
        .select("client_id")
        .eq("organization_id", auth.organizationId)
        .eq("team_member_id", auth.userId);
      if (accessError) throw accessError;
      const allowedIds = (access ?? []).map((item) => item.client_id);
      query = query.in("id", allowedIds.length ? allowedIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    const ids = (rows ?? []).map((row) => row.id);
    const { data: doctors, error: doctorError } = ids.length
      ? await auth.supabase.from("atendhub_professionals").select("id, client_id, name, crm, specialties").in("client_id", ids).order("name")
      : { data: [], error: null };
    if (doctorError) throw doctorError;
    return NextResponse.json((rows ?? []).map((row) => serialize(row, (doctors ?? []).filter((doctor) => doctor.client_id === row.id).map((doctor) => ({ id: doctor.id, name: doctor.name, crm: doctor.crm, uf: "SP", specialties: doctor.specialties ?? [] })))));
  } catch (error) { return apiError(error, 500); }
}

export async function POST(request: Request) {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin") return apiError(new Error("Somente superadministradores podem criar clientes."), 403);
  const parsed = clientInput.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."));
  const client = { ...parsed.data, id: crypto.randomUUID(), organizationId: auth.organizationId } as Client;
  try {
    const operationId = await resolveOperation(auth.admin, auth.organizationId, client);
    const { data: row, error } = await auth.admin.from("atendhub_clients").insert({ id: client.id, organization_id: auth.organizationId, operation_id: operationId, name: client.name, status: client.status, metadata: client }).select("id, organization_id, name, status, metadata").single();
    if (error || !row) throw error ?? new Error("Cliente não foi criado.");
    if (client.doctors.length) {
      const { error: doctorError } = await auth.admin.from("atendhub_professionals").insert(client.doctors.map((doctor) => ({ id: doctor.id, organization_id: auth.organizationId, client_id: client.id, name: doctor.name, professional_type: "doctor", crm: doctor.crm, specialties: doctor.specialties, status: "active" })));
      if (doctorError) throw doctorError;
    }
    return NextResponse.json(serialize(row, client.doctors), { status: 201 });
  } catch (error) { return apiError(error, 409); }
}
