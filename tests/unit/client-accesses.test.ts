import { afterEach, expect, it, vi } from "vitest";
import { sealPassword, openPassword } from "@/features/clients/accesses/crypto";
import { externalUrl } from "@/features/clients/accesses/model";
afterEach(() => vi.unstubAllEnvs());
it("criptografa senha e autentica a organização, cliente e registro", () => {
  vi.stubEnv("ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY", "a".repeat(64));
  const sealed = sealPassword("senha de teste", "org:client:entry");
  expect(JSON.stringify(sealed)).not.toContain("senha de teste");
  expect(openPassword(sealed, "org:client:entry")).toBe("senha de teste");
  expect(() => openPassword(sealed, "other:client:entry")).toThrow();
  expect(sealPassword("senha de teste", "org:client:entry").iv).not.toBe(
    sealed.iv,
  );
  expect(() =>
    openPassword(
      { ...sealed, tag: Buffer.alloc(16).toString("base64") },
      "org:client:entry",
    ),
  ).toThrow();
});
it("recusa gravar sem chave válida e bloqueia links executáveis/com senha", () => {
  vi.stubEnv("ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY", "");
  expect(() => sealPassword("senha", "context")).toThrow(
    "ENCRYPTION_NOT_CONFIGURED",
  );
  expect(externalUrl.safeParse("javascript:alert(1)").success).toBe(false);
  expect(externalUrl.safeParse("https://login:senha@exemplo.com").success).toBe(
    false,
  );
  expect(externalUrl.safeParse("https://agenda.example/consulta").success).toBe(
    true,
  );
  expect(externalUrl.safeParse("").success).toBe(true);
});
