import { NextResponse } from "next/server";
import {
  authorizeClient,
  accessAdmin,
  accessError,
  noStore,
  publicAccessColumns,
} from "@/features/clients/accesses/server";
import { accessSchema } from "@/features/clients/accesses/model";
import { sealPassword } from "@/features/clients/accesses/crypto";
type Context = { params: Promise<{ clientId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { clientId } = await params;
  const auth = await authorizeClient(clientId, true);
  if ("error" in auth) return auth.error;
  try {
    const { data, error } = await accessAdmin()
      .from("atendhub_client_accesses")
      .select(publicAccessColumns)
      .eq("organization_id", auth.organizationId)
      .eq("client_id", clientId)
      .order("label");
    if (error) throw error;
    return NextResponse.json(data, { headers: noStore });
  } catch (error) {
    return accessError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  const { clientId } = await params;
  const auth = await authorizeClient(clientId, true);
  if ("error" in auth) return auth.error;
  const input = accessSchema.safeParse(await request.json().catch(() => null));
  if (!input.success || !input.data.password)
    return NextResponse.json(
      { error: "Informe plataforma, login e senha válidos." },
      { status: 400 },
    );
  try {
    const id = crypto.randomUUID();
    const { password, ...metadata } = input.data;
    const encrypted_password = sealPassword(
      password,
      `${auth.organizationId}:${clientId}:${id}`,
    );
    const { data, error } = await accessAdmin()
      .from("atendhub_client_accesses")
      .insert({
        ...metadata,
        id,
        client_id: clientId,
        organization_id: auth.organizationId,
        encrypted_password,
        created_by_id: auth.userId,
      })
      .select(publicAccessColumns)
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201, headers: noStore });
  } catch (error) {
    return accessError(error);
  }
}
