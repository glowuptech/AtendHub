import { beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/features/whatsapp/server", () => ({
  integrationAdmin: () => ({ rpc }),
}));
import { POST } from "@/app/api/whatsapp/callback/route";
const payload = {
  connectionId: "00000000-0000-4000-8000-000000000123",
  eventId: "00000000-0000-4000-8000-000000000124",
  status: "connected",
};
function req(
  secret = "test-secret",
  stamp = String(Math.floor(Date.now() / 1000)),
  body = JSON.stringify(payload),
) {
  return new Request("http://localhost", {
    method: "POST",
    headers: {
      "x-atendhub-timestamp": stamp,
      "x-atendhub-signature": createHmac("sha256", secret)
        .update(stamp + "." + body)
        .digest("hex"),
    },
    body,
  });
}
beforeEach(() => {
  vi.stubEnv("ATENDHUB_WHATSAPP_CALLBACK_SECRET", "test-secret");
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
});
it("callback assinado utiliza apenas o evento e conexão verificados", async () => {
  expect((await POST(req())).status).toBe(200);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("atendhub_whatsapp_callback", {
    p_connection_id: payload.connectionId,
    p_event_id: payload.eventId,
    p_status: "connected",
  });
});
it("recusa assinatura adulterada ou expirada antes de acessar o banco", async () => {
  expect((await POST(req("bad"))).status).toBe(401);
  expect((await POST(req("test-secret", "1"))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it("não inventa conexão se callback antigo for ignorado", async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  expect(await (await POST(req())).json()).toEqual({ applied: false });
});
