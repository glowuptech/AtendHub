import "server-only";
import { z } from "zod";
import {
  accessEncryptionConfigured,
  openPassword,
  sealPassword,
} from "@/features/clients/accesses/crypto";
import { MetaError, validateMetaAccess, type MetaAccess } from "./meta";
import type { MetaCredentialStatus } from "./model";
import { MediaError, type paidMediaAdmin } from "./server";

type Admin = ReturnType<typeof paidMediaAdmin>;
const table = "atendhub_meta_credentials";
const context = (org: string) => `atendhub:meta-access-token:${org}`;
const encryptionMessage =
  "O armazenamento seguro aguarda a configuração da chave de criptografia no servidor.";
const migrationMessage =
  "O cadastro do token aguarda a migration de credenciais Meta.";
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

const graphMajor = 27;
function graphVersion() {
  const override = process.env.ATENDHUB_META_API_VERSION?.trim() ?? "";
  const major = /^v([1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})$/.exec(
    override,
  )?.[1];
  return Number(major) >= graphMajor ? override : `v${graphMajor}.0`;
}
function environmentAccess(org: string): MetaAccess | null {
  const token = process.env.ATENDHUB_META_ACCESS_TOKEN?.trim();
  return token && process.env.ATENDHUB_META_ORGANIZATION_ID === org
    ? { token, version: graphVersion() }
    : null;
}

export async function readMetaCredentialStatus(
  admin: Admin,
  org: string,
): Promise<MetaCredentialStatus> {
  const { data, error } = await admin
    .from(table)
    .select("updated_at")
    .eq("organization_id", org)
    .maybeSingle();
  if (error && !missingTable(error.code)) throw error;
  const encryptedStorageReady = accessEncryptionConfigured();
  return {
    configured: data ? encryptedStorageReady : !!environmentAccess(org),
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
    .select("encrypted_token")
    .eq("organization_id", org)
    .maybeSingle();
  if (error && !missingTable(error.code)) throw error;
  if (data) {
    if (!accessEncryptionConfigured()) throw new MediaError(encryptionMessage);
    try {
      return {
        token: openPassword(data.encrypted_token, context(org)),
        version: graphVersion(),
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
  token: string,
): Promise<MetaCredentialStatus> {
  if (!accessEncryptionConfigured()) throw new MediaError(encryptionMessage);
  const current = await admin
    .from(table)
    .select("revision")
    .eq("organization_id", org)
    .maybeSingle();
  if (current.error) throw current.error;
  const version = graphVersion();
  await validateMetaAccess({ token, version });

  const values = {
    encrypted_token: sealPassword(token, context(org)),
    api_version: version,
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
