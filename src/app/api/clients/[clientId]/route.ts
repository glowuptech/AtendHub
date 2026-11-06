import { NextResponse } from "next/server";
import { z } from "zod";
import { ClientSchema, type Client } from "@/domain/schemas";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

const clientInput = ClientSchema.omit({ id: true, organizationId: true });
export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin") return apiError(new Error("Somente superadministradores podem editar clientes."), 403);
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) return apiError(new Error("Cliente inválido."));
  const parsed = clientInput.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."));
  const client = { ...parsed.data, id: clientId, organizationId: auth.organizationId } as Client;
  try {
    const code = client.branding === "prescrita" ? "prescrita" : "veredite";
    const { data: operation, error: operationError } = await auth.admin.from("atendhub_operations").select("id").eq("organization_id", auth.organizationId).eq("code", code).single();
    if (operationError || !operation) throw operationError ?? new Error("Operação não encontrada.");
    const { data: row, error } = await auth.admin.from("atendhub_clients").update({ operation_id: operation.id, name: client.name, status: client.status, metadata: client, updated_at: new Date().toISOString() }).eq("id", clientId).eq("organization_id", auth.organizationId).select("id, organization_id, name, status, metadata").single();
    if (error || !row) throw error ?? new Error("Cliente não encontrado.");
    const { error: deleteError } = await auth.admin.from("atendhub_professionals").delete().eq("client_id", clientId).eq("organization_id", auth.organizationId);
    if (deleteError) throw deleteError;
    if (client.doctors.length) {
      const { error: doctorError } = await auth.admin.from("atendhub_professionals").insert(client.doctors.map((doctor) => ({ id: doctor.id, organization_id: auth.organizationId, client_id: clientId, name: doctor.name, professional_type: "doctor", crm: doctor.crm, specialties: doctor.specialties, status: "active" })));
      if (doctorError) throw doctorError;
    }
    return NextResponse.json(client);
  } catch (error) { return apiError(error, 409); }
}
