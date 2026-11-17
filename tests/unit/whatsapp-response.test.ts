import { expect, it } from "vitest";
import { parseWhatsappResponse } from "@/features/whatsapp/response";
const qr =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=";
it("aceita a resposta real do n8n: lista, Final serializado, success e connecting", () => {
  const result = parseWhatsappResponse([
    {
      Final: JSON.stringify({
        success: true,
        status: "connecting",
        qr_code: qr,
        pairing_code: null,
        message: "QR Code gerado",
        apikey: "never-send-this",
      }),
    },
  ]);
  expect(result).toMatchObject({
    ok: true,
    status: "awaiting_confirmation",
    qrCode: qr,
  });
  expect(JSON.stringify(result)).not.toContain("apikey");
  expect(JSON.stringify(result)).not.toContain("never-send-this");
});
it("aceita JSON direto, base64 puro e respostas antigas sem QR", () => {
  expect(
    parseWhatsappResponse({
      success: true,
      status: "connecting",
      qr_code: qr.split(",")[1],
      message: "QR",
    }).qrCode,
  ).toBe(qr);
  expect(
    parseWhatsappResponse({
      ok: true,
      status: "connected",
      message: "Conectado",
    }),
  ).toMatchObject({ ok: true, status: "connected" });
});
it("rejeita URL externa, SVG, imagem inválida e respostas ambíguas", () => {
  for (const value of [
    "https://example.com/image.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJj",
  ])
    expect(() =>
      parseWhatsappResponse({
        success: true,
        status: "connecting",
        qr_code: value,
        message: "QR",
      }),
    ).toThrow();
  expect(() => parseWhatsappResponse([{ ok: true }, { ok: true }])).toThrow();
  expect(() =>
    parseWhatsappResponse({
      success: true,
      status: "connected",
      qr_code: qr,
      message: "Conectado",
    }),
  ).toThrow();
});
