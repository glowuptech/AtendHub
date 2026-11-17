import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  event: {
    id: "00000000-0000-4000-8000-000000000101",
    connection_id: "00000000-0000-4000-8000-000000000102",
    event_type: "whatsapp.connection.confirm_requested",
    payload: {
      id: "00000000-0000-4000-8000-000000000101",
      schemaVersion: 1,
      eventType: "whatsapp.connection.confirm_requested",
      occurredAt: "2026-11-17T12:00:00.000Z",
      organizationId: "00000000-0000-4000-8000-000000000103",
      actorId: "00000000-0000-4000-8000-000000000104",
      client: {
        id: "00000000-0000-4000-8000-000000000105",
        name: "Clínica Azul",
        operationId: "00000000-0000-4000-8000-000000000106",
      },
      connection: {
        id: "00000000-0000-4000-8000-000000000102",
        instanceName: "clinica-azul-recepcao",
        name: "recepcao",
        phone: "551633334444",
      },
    },
    delivery_status: "pending",
    result_status: null,
  } as Record<string, unknown>,
  settings: {
    config: { whatsappConnection: "https://n8n.example/webhook/whatsapp" },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: state.rpc })),
}));

import { dispatchConnectionEvent } from "@/features/whatsapp/server";

const auth = {
  organizationId: "00000000-0000-4000-8000-000000000103",
  supabase: { from: state.from },
} as never;

function makeQuery(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function setEvent(
  changes: Partial<typeof state.event> & Record<string, unknown> = {},
) {
  state.event = { ...state.event, ...changes };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.stubEnv("ATENDHUB_WHATSAPP_WEBHOOK_SECRET", "");
  vi.stubEnv("ATENDHUB_WHATSAPP_CALLBACK_SECRET", "");
  vi.stubEnv("ATENDHUB_WHATSAPP_CONNECTION_WEBHOOK_URL", "");
  setEvent({
    event_type: "whatsapp.connection.confirm_requested",
    delivery_status: "pending",
    result_status: null,
  });
  state.settings = {
    config: { whatsappConnection: "https://n8n.example/webhook/whatsapp" },
  };
  state.from.mockImplementation((table: string) =>
    makeQuery(
      table === "atendhub_whatsapp_events"
        ? { data: state.event, error: null }
        : { data: state.settings, error: null },
    ),
  );
  state.rpc.mockImplementation(
    async (_name: string, args: Record<string, unknown>) => ({
      data: {
        received: args.p_delivery_status === "delivered",
        applied: Boolean(args.p_result_status),
        stale: false,
        status: args.p_result_status ?? null,
      },
      error: null,
    }),
  );
});

afterEach(() => vi.unstubAllEnvs());

it("envia o payload salvo por POST sem exigir ou enviar secrets", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      ok: true,
      status: "connected",
      message: "Conexão confirmada.",
    }),
  );

  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    transport,
  );

  expect(result).toMatchObject({
    ok: true,
    kind: "completed",
    status: "connected",
  });
  const [url, init] = transport.mock.calls[0];
  expect(String(url)).toBe("https://n8n.example/webhook/whatsapp");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual(state.event.payload);
  expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
    state.event.id,
  );
  expect(new Headers(init?.headers).has("X-AtendHub-Signature")).toBe(false);
  expect(state.rpc).toHaveBeenCalledWith("atendhub_whatsapp_apply_response", {
    p_event_id: state.event.id,
    p_delivery_status: "delivered",
    p_result_status: "connected",
  });
});

it.each([
  ["create_requested", "awaiting_confirmation"],
  ["confirm_requested", "connected"],
  ["update_requested", "disconnected"],
  ["update_requested", "awaiting_confirmation"],
  ["delete_requested", "deleted"],
] as const)("persiste o estado real %s → %s", async (action, status) => {
  setEvent({ event_type: `whatsapp.connection.${action}` });
  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, status, message: "Resultado da Evolution." }),
      ),
  );
  expect(result).toMatchObject({ ok: true, kind: "completed", status });
  expect(state.rpc).toHaveBeenCalledWith(
    "atendhub_whatsapp_apply_response",
    expect.objectContaining({
      p_delivery_status: "delivered",
      p_result_status: status,
    }),
  );
});

it("registra recebimento genérico sem inventar status conectado", async () => {
  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, message: "Evento recebido." }),
      ),
  );
  expect(result).toMatchObject({ ok: true, kind: "received" });
  expect(state.rpc).toHaveBeenCalledWith("atendhub_whatsapp_apply_response", {
    p_event_id: state.event.id,
    p_delivery_status: "delivered",
    p_result_status: null,
  });
});

it("mantém o evento disponível após ok:false, HTTP de erro ou JSON inválido", async () => {
  const cases = [
    [
      Response.json({ ok: false, message: "Evolution indisponível." }),
      "Evolution indisponível.",
    ],
    [Response.json({ ok: true }, { status: 500 }), "HTTP 500"],
    [new Response("<html>erro</html>"), "JSON válido"],
  ] as const;
  for (const [response, expectedMessage] of cases) {
    state.rpc.mockClear();
    const result = await dispatchConnectionEvent(
      auth,
      state.event.id as string,
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain(expectedMessage);
    expect(state.rpc).toHaveBeenCalledWith("atendhub_whatsapp_apply_response", {
      p_event_id: state.event.id,
      p_delivery_status: "retry",
      p_result_status: null,
    });
  }
});

it("expira uma tentativa travada e deixa o evento reenviável", async () => {
  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError")),
  );
  expect(result).toMatchObject({ ok: false, httpStatus: 504 });
  expect(state.rpc).toHaveBeenCalledWith(
    "atendhub_whatsapp_apply_response",
    expect.objectContaining({ p_delivery_status: "retry" }),
  );
});

it("recusa estado incompatível com a ação", async () => {
  setEvent({ event_type: "whatsapp.connection.create_requested" });
  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, status: "connected", message: "Conectado." }),
      ),
  );
  expect(result).toMatchObject({ ok: false, httpStatus: 502 });
  expect(state.rpc).toHaveBeenCalledWith(
    "atendhub_whatsapp_apply_response",
    expect.objectContaining({ p_delivery_status: "retry" }),
  );
});

it("não aplica a resposta quando outra ação já é a mais recente", async () => {
  state.rpc.mockResolvedValue({
    data: { received: true, applied: false, stale: true, status: null },
    error: null,
  });
  const result = await dispatchConnectionEvent(
    auth,
    state.event.id as string,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, status: "connected", message: "Conectado." }),
      ),
  );
  expect(result).toMatchObject({ ok: true, kind: "stale" });
});

it("recebe QR serializado em Final, persiste aguardando e nunca retorna apikey", async () => {
  setEvent({ event_type: "whatsapp.connection.create_requested" });
  const qr =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=";
  const transport = vi
    .fn()
    .mockResolvedValue(
      Response.json([
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
      ]),
    );
  const result = await dispatchConnectionEvent(
    auth,
    String(state.event.id),
    transport,
  );
  expect(result).toMatchObject({
    ok: true,
    status: "awaiting_confirmation",
    qrCode: qr,
  });
  expect(JSON.stringify(result)).not.toContain("never-send-this");
  expect(state.rpc).toHaveBeenCalledWith(
    "atendhub_whatsapp_apply_response",
    expect.objectContaining({ p_result_status: "awaiting_confirmation" }),
  );
});
