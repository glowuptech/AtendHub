import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authorizeClient,
  accessAdmin,
  accessError,
  noStore,
  publicAccessColumns,
} from "@/features/clients/accesses/server";
import { accessSchema } from "@/features/clients/accesses/model";
import { sealPassword, openPassword } from "@/features/clients/accesses/crypto";
type Context = { params: Promise<{ clientId: string; id: string }> };
async function context(params: Context["params"]) {
  const ids = await params;
  const auth = await authorizeClient(ids.clientId, true);
  if ("error" in auth) return { error: auth.error! } as const;
  if (!z.string().uuid().safeParse(ids.id).success)
    return {
      error: NextResponse.json({ error: "Acesso inválido." }, { status: 400 }),
    } as const;
  return { auth, ...ids };
}
export async function POST(_request: Request, { params }: Context) {
  const result = await context(params);
  if ("error" in result) return result.error;
  const { auth, clientId, id } = result;
  try {
    const { data, error } = await accessAdmin()
      .from("atendhub_client_accesses")
      .select("encrypted_password")
      .eq("id", id)
      .eq("client_id", clientId)
      .eq("organization_id", auth.organizationId)
      .single();
    if (error) throw error;
    return NextResponse.json(
      {
        password: openPassword(
          data.encrypted_password,
          `${auth.organizationId}:${clientId}:${id}`,
        ),
      },
      { headers: noStore },
    );
  } catch (error) {
    return accessError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const result = await context(params);
  if ("error" in result) return result.error;
  const { auth, clientId, id } = result;
  const input = accessSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Revise os campos do acesso." },
      { status: 400 },
    );
  try {
    const { password, ...metadata } = input.data;
    const fields = {
      ...metadata,
      updated_at: new Date().toISOString(),
      ...(password
        ? {
            encrypted_password: sealPassword(
              password,
              `${auth.organizationId}:${clientId}:${id}`,
            ),
          }
        : {}),
    };
    const { data, error } = await accessAdmin()
      .from("atendhub_client_accesses")
      .update(fields)
      .eq("id", id)
      .eq("client_id", clientId)
      .eq("organization_id", auth.organizationId)
      .select(publicAccessColumns)
      .single();
    if (error) throw error;
    return NextResponse.json(data, { headers: noStore });
  } catch (error) {
    return accessError(error);
  }
}
export async function DELETE(_request: Request, { params }: Context) {
  const result = await context(params);
  if ("error" in result) return result.error;
  const { auth, clientId, id } = result;
  try {
    const { data, error } = await accessAdmin()
      .from("atendhub_client_accesses")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId)
      .eq("organization_id", auth.organizationId)
      .select("id")
      .single();
    if (error || !data) throw error;
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return accessError(error);
  }
}
