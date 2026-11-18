import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
function key() {
  const value = process.env.ATENDHUB_CLIENT_ACCESS_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error("ENCRYPTION_NOT_CONFIGURED");
  return Buffer.from(value, "hex");
}
export function sealPassword(password: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}
export function openPassword(
  value: { version: number; iv: string; tag: string; data: string },
  context: string,
) {
  if (value.version !== 1) throw new Error("INVALID_CIPHER_VERSION");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
