import { NextResponse } from "next/server";
import { ClientSchema, DoctorSchema, type Client } from "@/domain/schemas";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { canAccessKnowledge } from "@/features/clients/knowledge-server";
import { clientCategory, databaseClientStatus } from "@/features/clients/operation";

const clientInput = ClientSchema.omit({ id: true, organizationId: true });
const serialize = (row: { id: string; organization_id: string; name: string; status: string; metadata: unknown }, doctors: Client["doctors"]): Client => {
  const client = ClientSchema.parse({ ...(row.metadata as object), id: row.id, organizationId: row.organization_id, name: row.name, status: row.status === "inactive" ? "paused" : row.status, doctors });
  return { ...client, category: clientCategory(client) };
};

function savedProfessionalUf(metadata: unknown, id: string) {
  if (!metadata || typeof metadata !== "object" || !("doctors" in metadata) || !Array.isArray(metadata.doctors)) return "SP";
  return DoctorSchema.shape.uf.safeParse(metadata.doctors.find((doctor) => doctor?.id === id)?.uf).data ?? "SP";
}

export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  try {
    const canViewKnowledge = await canAccessKnowledge(auth, "view");
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
    const clients = (rows ?? []).map((row) =>
      serialize(
        row,
        (doctors ?? [])
          .filter((doctor) => doctor.client_id === row.id)
          .map((doctor) => ({
            id: doctor.id,
            name: doctor.name,
            crm: doctor.crm,
            uf: savedProfessionalUf(row.metadata, doctor.id),
            specialties: doctor.specialties ?? [],
          })),
      ),
    );
    return NextResponse.json(
      canViewKnowledge
        ? clients
        : clients.map((client) => ({ ...client, knowledge: [] })),
    );
  } catch (error) { return apiError(error, 500); }
}

export async function POST(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin") return apiError(new Error("Somente superadministradores podem criar clientes."), 403);
  const parsed = clientInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."));
  const client: Client = {
    ...parsed.data,
    id: crypto.randomUUID(),
    organizationId: auth.organizationId,
    category: clientCategory(parsed.data),
  };
  try {
    const { error } = await auth.supabase.rpc("atendhub_create_client_with_professionals", {
      _organization_id: auth.organizationId,
      _client_id: client.id,
      _name: client.name,
      _status: databaseClientStatus(client.status),
      _metadata: client,
      _professionals: client.doctors,
    });
    if (error) throw error;
    return NextResponse.json(client, { status: 201 });
  } catch (error) { return apiError(error, 409); }
}
