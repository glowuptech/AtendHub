import { NextResponse } from "next/server";
import { z } from "zod";
import { ClientSchema, type Client } from "@/domain/schemas";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

const clientInput = ClientSchema.omit({ id: true, organizationId: true });

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const requestId = crypto.randomUUID();
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin") return apiError(new Error("Somente superadministradores podem editar clientes."), 403, { requestId, stage: "authorization" });

  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) return apiError(new Error("Cliente inválido."), 400, { requestId, stage: "validation.client_id" });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch (error) {
    return apiError(error, 400, { requestId, stage: "validation.body" });
  }
  const parsed = clientInput.safeParse(rawBody);
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Dados inválidos."), 400, { requestId, stage: "validation.schema" });

  const client = { ...parsed.data, id: clientId, organizationId: auth.organizationId } as Client;
  try {
    const code = client.branding === "prescrita" ? "prescrita" : "veredite";
    const { data: operation, error: operationError } = await auth.admin
      .from("atendhub_operations")
      .select("id")
      .eq("organization_id", auth.organizationId)
      .eq("code", code)
      .single();
    if (operationError || !operation) throw Object.assign(new Error("Operação não encontrada."), { code: operationError?.code ?? "OPERATION_NOT_FOUND" });

    const professionalType = code === "prescrita" ? "health" : "legal";
    const professionals = client.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      professional_type: professionalType,
      crm: doctor.crm,
      specialties: doctor.specialties,
      status: "active",
    }));

    const { error } = await auth.supabase.rpc("atendhub_update_client_with_professionals", {
      _organization_id: auth.organizationId,
      _client_id: clientId,
      _operation_id: operation.id,
      _name: client.name,
      _status: client.status,
      _metadata: client,
      _professionals: professionals,
    });
    if (error) throw error;
    return NextResponse.json(client, { headers: { "x-support-id": requestId } });
  } catch (error) {
    console.error("[v0] client-update-failed", { requestId, stage: "transaction.client_and_professionals", clientId, organizationId: auth.organizationId });
    return apiError(error, 409, { requestId, stage: "transaction.client_and_professionals" });
  }
}
