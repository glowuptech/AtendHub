import "server-only";
import { z } from "zod";
import {
  accessEncryptionConfigured,
  openPassword,
  sealPassword,
} from "@/features/clients/accesses/crypto";
import { MetaError, validateMetaAccess, type MetaAccess } from "./meta";
import { metaApiVersion, type MetaCredentialStatus } from "./model";
import { MediaError, type paidMediaAdmin } from "./server";

type Admin = ReturnType<typeof paidMediaAdmin>;
const table = "atendhub_meta_credentials";
const context = (org: string) => `atendhub:meta-access-token:${org}`;
const encryptionMessage =
  "O armazenamento seguro aguarda a configuração da chave de criptografia no servidor.";
const migrationMessage =
  "O cadastro do token aguarda a migration de credenciais Meta.";
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

function environmentVersion() {
  const parsed = metaApiVersion.safeParse(
    process.env.ATENDHUB_META_API_VERSION,
  );
  return parsed.success ? parsed.data : null;
}
function environmentAccess(org: string): MetaAccess | null {
  const token = process.env.ATENDHUB_META_ACCESS_TOKEN?.trim();
  const version = environmentVersion();
  return token && version && process.env.ATENDHUB_META_ORGANIZATION_ID === org
    ? { token, version }
    : null;
}

export async function readMetaCredentialStatus(
  admin: Admin,
  org: string,
): Promise<MetaCredentialStatus> {
  const { data, error } = await admin
    .from(table)
    .select("api_version,updated_at")
    .eq("organization_id", org)
    .maybeSingle();
  if (error && !missingTable(error.code)) throw error;
  const encryptedStorageReady = accessEncryptionConfigured();
  return {
    configured: data ? encryptedStorageReady : !!environmentAccess(org),
    version: data?.api_version ?? environmentVersion(),
    updatedAt: data?.updated_at ?? null,
    setupMessage: error
      ? migrationMessage
      : encryptedStorageReady
        ? null
        : encryptionMessage,
  };
}

export async function getMetaAccess(
  admin: Admin,
  org: string,
): Promise<MetaAccess> {
  const { data, error } = await admin
    .from(table)
    .select("encrypted_token,api_version")
    .eq("organization_id", org)
    .maybeSingle();
  if (error && !missingTable(error.code)) throw error;
  if (data) {
    if (!accessEncryptionConfigured()) throw new MediaError(encryptionMessage);
    try {
      return {
        token: openPassword(data.encrypted_token, context(org)),
        version: data.api_version,
      };
    } catch {
      throw new MediaError(
        "O token salvo não pôde ser aberto. Confira a chave de criptografia do servidor.",
      );
    }
  }
  const fallback = environmentAccess(org);
  if (fallback) return fallback;
  throw new MetaError(
    "Cadastre o token da Meta em Tráfego pago → Contas vinculadas.",
    503,
  );
}

export async function saveMetaAccess(
  admin: Admin,
  org: string,
  access: MetaAccess,
): Promise<MetaCredentialStatus> {
  if (!accessEncryptionConfigured()) throw new MediaError(encryptionMessage);
  const current = await admin
    .from(table)
    .select("revision")
    .eq("organization_id", org)
    .maybeSingle();
  if (current.error) throw current.error;
  await validateMetaAccess(access);

  const values = {
    encrypted_token: sealPassword(access.token, context(org)),
    api_version: access.version,
    updated_at: new Date().toISOString(),
  };
  const write = current.data
    ? admin
        .from(table)
        .update({ ...values, revision: current.data.revision + 1 })
        .eq("organization_id", org)
        .eq("revision", current.data.revision)
    : admin.from(table).insert({ ...values, organization_id: org });
  const { data, error } = await write.select("updated_at").maybeSingle();
  if (error && error.code !== "23505") throw error;
  if (!data)
    throw new MediaError(
      "Outro administrador atualizou a credencial. Confira o estado atual e tente novamente.",
      409,
    );
  return {
    configured: true,
    version: access.version,
    updatedAt: data.updated_at,
    setupMessage: null,
  };
}

export async function scheduledMetaOrganization(admin: Admin) {
  const selected = process.env.ATENDHUB_META_ORGANIZATION_ID;
  if (selected) return z.uuid().safeParse(selected).data ?? null;
  const { data, error } = await admin
    .from(table)
    .select("organization_id")
    .limit(2);
  if (error && !missingTable(error.code)) throw error;
  return data?.length === 1 ? (data[0]?.organization_id as string) : null;
}
