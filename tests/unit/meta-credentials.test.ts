import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sealPassword } from "@/features/clients/accesses/crypto";
import {
  getMetaAccess,
  readMetaCredentialStatus,
  saveMetaAccess,
  scheduledMetaOrganization,
} from "@/features/paid-media/meta-credentials";

vi.mock("server-only", () => ({}));

const org = "df81fff1-62f2-45bc-b3cb-5b5eb5e2d7a5";
const other = "00000000-0000-4000-8000-000000000001";
const legacy = { token: "previous-environment-token", version: "v97.0" };
const renewed = { token: "renewed-test-token", version: "v99.0" };
const now = "2026-11-23T13:00:00Z";

function repository(
  row: Record<string, unknown> | null = null,
  organizations: string[] = [],
) {
  const lookupByOrg = vi.fn((_, tenant) => ({
    maybeSingle: async () => ({
      data: tenant === org ? row : null,
      error: null,
    }),
  }));
  const select = vi.fn(() => ({
    eq: lookupByOrg,
    limit: async () => ({
      data: organizations.map((organization_id) => ({ organization_id })),
      error: null,
    }),
  }));
  const result = {
    select: () => ({
      maybeSingle: async () => ({ data: { updated_at: now }, error: null }),
    }),
  };
  const revision = vi.fn(() => result);
  const target = vi.fn(() => ({ eq: revision }));
  const update = vi.fn<(values: unknown) => { eq: typeof target }>(() => ({
    eq: target,
  }));
  const insert = vi.fn<(values: unknown) => typeof result>(() => result);
  const from = vi.fn(() => ({ select, insert, update }));
  const admin = { from } as unknown as Parameters<typeof getMetaAccess>[0];
  return { admin, insert, update, select, target, revision };
}

beforeEach(() => {
  vi.stubEnv("ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY", "b".repeat(64));
  vi.stubEnv("ATENDHUB_META_ORGANIZATION_ID", org);
  vi.stubEnv("ATENDHUB_META_ACCESS_TOKEN", legacy.token);
  vi.stubEnv("ATENDHUB_META_API_VERSION", legacy.version);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("valida na Meta, grava somente o segredo cifrado e usa a nova versão ao consultar", async () => {
  const db = repository({ revision: 2 });
  const graph = vi.fn(async () => Response.json({ data: [{ id: "act_123" }] }));
  vi.stubGlobal("fetch", graph);
  const status = await saveMetaAccess(db.admin, org, renewed);
  expect(status).toEqual({
    configured: true,
    updatedAt: now,
    version: renewed.version,
    setupMessage: null,
  });
  expect(graph).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: "https://graph.facebook.com",
      pathname: "/v99.0/me/adaccounts",
    }),
    expect.objectContaining({
      headers: { Authorization: "Bearer " + renewed.token },
    }),
  );
  const stored = db.update.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(stored).toMatchObject({ api_version: renewed.version, revision: 3 });
  expect(JSON.stringify(stored)).not.toContain(renewed.token);
  expect(db.target).toHaveBeenCalledWith("organization_id", org);
  expect(db.revision).toHaveBeenCalledWith("revision", 2);
  const storedRepo = repository(stored);
  expect(await getMetaAccess(storedRepo.admin, org)).toEqual(renewed);
  expect(await readMetaCredentialStatus(storedRepo.admin, org)).toMatchObject({
    updatedAt: stored.updated_at,
  });
  expect(storedRepo.select).toHaveBeenLastCalledWith("api_version,updated_at");
});

it("preserva o token anterior quando o novo foi revogado ou não possui conta", async () => {
  const db = repository({ revision: 2 });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 190, message: "segredo" } },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ data: [] })),
  );
  await expect(saveMetaAccess(db.admin, org, renewed)).rejects.toThrow(
    "expirou ou foi revogada",
  );
  await expect(saveMetaAccess(db.admin, org, renewed)).rejects.toThrow(
    "nenhuma conta de anúncios",
  );
  expect(db.update).not.toHaveBeenCalled();
  expect(db.insert).not.toHaveBeenCalled();
});

it("mantém o fallback restrito e vincula o segredo criptografado à organização", async () => {
  const db = repository();
  expect(await getMetaAccess(db.admin, org)).toEqual(legacy);
  await expect(getMetaAccess(db.admin, other)).rejects.toThrow(
    "Cadastre o token",
  );
  const wrongScope = repository({
    encrypted_token: sealPassword(
      renewed.token,
      "atendhub:meta-access-token:" + other,
    ),
    api_version: renewed.version,
  });
  await expect(getMetaAccess(wrongScope.admin, org)).rejects.toThrow(
    "não pôde ser aberto",
  );
  vi.stubEnv("ATENDHUB_META_ORGANIZATION_ID", "");
  expect(await scheduledMetaOrganization(repository(null, [org]).admin)).toBe(
    org,
  );
  expect(
    await scheduledMetaOrganization(repository(null, [org, other]).admin),
  ).toBeNull();
});
