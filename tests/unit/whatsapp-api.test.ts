import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("@/features/whatsapp/server", () => ({
  whatsappAuth: state.auth,
  dispatchConnectionEvent: state.dispatch,
}));
import { POST } from "@/app/api/whatsapp/connections/route";
const id = "00000000-0000-4000-8000-000000000100";
const requestId = "00000000-0000-4000-8000-000000000101";
const req = (phone = "(16) 3333-4444") =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({
      clientId: id,
      name: "recepcao",
      phone,
      requestId,
      organizationId: "spoofed",
      ownerId: "spoofed",
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.mockResolvedValue({
    organizationId: "org",
    supabase: { rpc: state.rpc },
  });
  state.rpc.mockResolvedValue({
    data: { eventId: id, connectionId: id },
    error: null,
  });
  state.dispatch.mockResolvedValue({
    ok: true,
    eventId: id,
    connectionId: id,
    kind: "received",
    message: "Evento recebido pelo n8n.",
  });
});
it("não usa organização/dono enviados pelo browser e normaliza o telefone", async () => {
  const response = (await POST(req()))!;
  expect(response.status).toBe(201);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith(
    "atendhub_whatsapp_command",
    {
      p_action: "create",
      p_request_id: requestId,
      p_client_id: id,
      p_name: "recepcao",
      p_phone: "551633334444",
    },
  );
  expect(await response.json()).toMatchObject({
    ok: true,
    kind: "received",
    message: "Evento recebido pelo n8n.",
  });
});
it("não cria nem dispara eventos sem autorização", async () => {
  state.auth.mockResolvedValue({ error: Response.json({}, { status: 403 }) });
  expect((await POST(req()))!.status).toBe(403);
  expect(state.rpc).not.toHaveBeenCalled();
  expect(state.dispatch).not.toHaveBeenCalled();
});
it("falha de envio mantém o evento persistido e a mesma chave para retentativa", async () => {
  state.dispatch.mockRejectedValue(new Error("network"));
  const response = await POST(req());
  expect(response!.status).toBe(502);
  expect(await response!.json()).toMatchObject({
    error: expect.stringContaining("Reenvie o mesmo evento"),
    eventId: id,
    connectionId: id,
  });
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
