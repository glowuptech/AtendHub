import { z } from "zod";
const qrImage = z
  .string()
  .max(1_400_000)
  .transform((value) =>
    value.startsWith("data:") ? value : `data:image/png;base64,${value}`,
  )
  .refine((value) => {
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length < 12 || bytes.toString("base64") !== match[2])
      return false;
    return match[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  }, "QR Code inválido. Retorne uma imagem PNG, JPEG ou WebP em base64.");
const apiKey = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const response = z
  .object({
    ok: z.boolean(),
    status: z
      .enum([
        "awaiting_confirmation",
        "connecting",
        "connected",
        "disconnected",
        "deleted",
      ])
      .optional(),
    message: z.string().trim().min(1).max(500).optional(),
    qrCode: qrImage.optional(),
    pairingCode: z
      .string()
      .regex(/^[0-9A-Z-]{4,24}$/i)
      .optional(),
    expiresIn: z.number().int().min(15).max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.ok && !v.message)
      ctx.addIssue({ code: "custom", message: "Informe o motivo da falha." });
    if (v.status && !v.message)
      ctx.addIssue({
        code: "custom",
        message: "Informe a mensagem do resultado.",
      });
    if (v.status === "connecting" && !v.qrCode && !v.pairingCode)
      ctx.addIssue({
        code: "custom",
        message: "Retorne o QR Code ou código de pareamento.",
      });
    if (
      (v.qrCode || v.pairingCode) &&
      ![undefined, "connecting", "awaiting_confirmation"].includes(v.status)
    )
      ctx.addIssue({
        code: "custom",
        message: "QR Code incompatível com o estado retornado.",
      });
  });
/** Unwrap one n8n item/Final and split the validated public result from its private credential. */
export function parseWhatsappResponse(input: unknown) {
  let value = input;
  for (let depth = 0; depth < 4; depth++) {
    if (Array.isArray(value)) {
      if (value.length !== 1)
        throw new Error("Retorne somente um resultado do n8n.");
      value = value[0];
      continue;
    }
    if (typeof value === "object" && value !== null && "Final" in value) {
      value = (value as { Final: unknown }).Final;
      continue;
    }
    if (typeof value === "string") {
      value = JSON.parse(value);
      continue;
    }
    break;
  }
  const raw = z.record(z.string(), z.unknown()).parse(value);
  if (
    raw.ok !== undefined &&
    raw.success !== undefined &&
    raw.ok !== raw.success
  )
    throw new Error("Resultado inconsistente.");
  const parsed = response.parse({
    ok: raw.ok ?? raw.success,
    status: raw.status,
    message: raw.message,
    qrCode: raw.qr_code ?? raw.qrCode ?? undefined,
    pairingCode: raw.pairing_code ?? raw.pairingCode ?? undefined,
    expiresIn: raw.expires_in ?? undefined,
  });
  const privateCredential =
    raw.apikey === undefined || raw.apikey === null
      ? undefined
      : apiKey.parse(raw.apikey);
  return {
    publicResult: {
      ...parsed,
      status:
        parsed.status === "connecting"
          ? ("awaiting_confirmation" as const)
          : parsed.status,
    },
    privateCredential,
  };
}
