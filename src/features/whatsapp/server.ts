import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

const responseStatusSchema = z.enum([
  "awaiting_confirmation",
  "connected",
  "disconnected",
  "deleted",
]);
const webhookResponseSchema = z
  .discriminatedUnion("ok", [
    z
      .object({
        ok: z.literal(true),
        status: responseStatusSchema.optional(),
        message: z.string().trim().min(1).max(500).optional(),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        message: z.string().trim().min(1).max(500),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.ok && value.status && !value.message) {
      context.addIssue({ code: "custom", message: "Informe a mensagem do resultado." });
    }
  });
const RESPONSE_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 16_384;

type EventStatus = z.infer<typeof responseStatusSchema>;
type EventType =
  | "whatsapp.connection.create_requested"
  | "whatsapp.connection.confirm_requested"
  | "whatsapp.connection.update_requested"
  | "whatsapp.connection.delete_requested";
type DispatchOutcome =
  | {
      ok: true;
      eventId: string;
      connectionId: string;
      kind: "completed" | "received" | "stale";
      status?: EventStatus;
      message: string;
    }
  | {
      ok: false;
      eventId: string;
      connectionId: string;
      httpStatus: number;
      message: string;
    };

export async function whatsappAuth() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth;
  if (auth.role !== "super_admin")
    return {
      error: NextResponse.json(
        { error: "Somente superadministradores podem gerenciar as conexões." },
        { status: 403 },
      ),
    } as const;
  return auth;
}

export function integrationAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("INTEGRATION_SERVER_UNCONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isCompatibleStatus(eventType: EventType, status: EventStatus) {
  switch (eventType) {
    case "whatsapp.connection.create_requested":
      return status === "awaiting_confirmation";
    case "whatsapp.connection.confirm_requested":
    case "whatsapp.connection.update_requested":
      return ["connected", "disconnected", "awaiting_confirmation"].includes(
        status,
      );
    case "whatsapp.connection.delete_requested":
      return status === "deleted";
  }
}

function destinationUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

async function applyResponse(
  admin: ReturnType<typeof integrationAdmin>,
  eventId: string,
  deliveryStatus: "delivered" | "retry",
  status: EventStatus | null,
) {
  const { data, error } = await admin.rpc("atendhub_whatsapp_apply_response", {
    p_event_id: eventId,
    p_delivery_status: deliveryStatus,
    p_result_status: status,
  });
  if (error || !data) throw new Error("WHATSAPP_RESULT_NOT_PERSISTED");
  return data as {
    received: boolean;
    applied: boolean;
    stale: boolean;
    status: EventStatus | null;
  };
}

export async function dispatchConnectionEvent(
  auth: Exclude<Awaited<ReturnType<typeof whatsappAuth>>, { error: unknown }>,
  eventId: string,
  transport: typeof fetch = fetch,
): Promise<DispatchOutcome> {
  const { data: event, error } = await auth.supabase
    .from("atendhub_whatsapp_events")
    .select(
      "id,connection_id,event_type,payload,delivery_status,result_status",
    )
    .eq("id", eventId)
    .eq("organization_id", auth.organizationId)
    .single();
  if (error || !event) throw error ?? new Error("EVENT_NOT_FOUND");

  const eventType = event.event_type as EventType;
  if (event.delivery_status === "delivered" && event.result_status) {
    return {
      ok: true,
      eventId,
      connectionId: event.connection_id,
      kind: "completed",
      status: event.result_status as EventStatus,
      message: "O resultado desta ação já foi confirmado e salvo.",
    };
  }

  const { data: settings, error: settingsError } = await auth.supabase
    .from("atendhub_webhook_settings")
    .select("config")
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (settingsError) throw settingsError;

  const savedUrl = (settings?.config as { whatsappConnection?: unknown } | null)
    ?.whatsappConnection;
  const url = destinationUrl(
    savedUrl || process.env.ATENDHUB_WHATSAPP_CONNECTION_WEBHOOK_URL,
  );
  let admin: ReturnType<typeof integrationAdmin>;
  try {
    admin = integrationAdmin();
  } catch {
    return {
      ok: false,
      eventId,
      connectionId: event.connection_id,
      httpStatus: 503,
      message:
        "O evento foi salvo, mas o envio não pode ser iniciado porque a integração do servidor está indisponível.",
    };
  }

  const fail = async (message: string, httpStatus: number) => {
    try {
      await applyResponse(admin, eventId, "retry", null);
    } catch {
      return {
        ok: false as const,
        eventId,
        connectionId: event.connection_id,
        httpStatus: 500,
        message:
          "Não foi possível registrar o resultado. O evento permanece salvo e pode ser reenviado com o mesmo ID.",
      };
    }
    return {
      ok: false as const,
      eventId,
      connectionId: event.connection_id,
      httpStatus,
      message,
    };
  };

  if (!url) {
    return fail(
      "Configure uma URL HTTPS em Configurações → Webhooks → Conexão WhatsApp. O evento continua salvo para reenvio.",
      503,
    );
  }

  let response: Response;
  let bodyText: string;
  try {
    response = await transport(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": event.id,
      },
      body: JSON.stringify(event.payload),
      signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
    });
    bodyText = await response.text();
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      ["TimeoutError", "AbortError"].includes(cause.name);
    return fail(
      timedOut
        ? "O n8n excedeu o limite de 45 segundos. O evento continua salvo; reenvie para verificar o mesmo ID."
        : "Não foi possível alcançar o webhook n8n. O evento continua salvo para reenvio com o mesmo ID.",
      timedOut ? 504 : 502,
    );
  }

  if (new TextEncoder().encode(bodyText).byteLength > MAX_RESPONSE_BYTES) {
    return fail(
      "A resposta do n8n excedeu o tamanho permitido. Revise o Respond to Webhook e reenvie o evento.",
      502,
    );
  }

  let rawResponse: unknown;
  try {
    rawResponse = JSON.parse(bodyText);
  } catch {
    return fail(
      "O n8n deve responder JSON válido pelo Respond to Webhook. O evento continua salvo para reenvio.",
      502,
    );
  }
  const parsed = webhookResponseSchema.safeParse(rawResponse);

  if (!response.ok) {
    const message =
      parsed.success && !parsed.data.ok
        ? parsed.data.message
        : `O webhook respondeu com HTTP ${response.status}. O evento continua salvo para reenvio.`;
    return fail(message, 502);
  }

  if (!parsed.success) {
    return fail(
      "Resposta JSON inválida do n8n. Use { ok: true, status, message } ou { ok: false, message } no Respond to Webhook.",
      502,
    );
  }
  if (!parsed.data.ok) return fail(parsed.data.message, 502);
  if (
    parsed.data.status &&
    !isCompatibleStatus(eventType, parsed.data.status)
  ) {
    return fail(
      "O estado retornado não é compatível com esta ação. O evento continua salvo para correção e reenvio.",
      502,
    );
  }

  let persisted: Awaited<ReturnType<typeof applyResponse>>;
  try {
    persisted = await applyResponse(
      admin,
      eventId,
      "delivered",
      parsed.data.status ?? null,
    );
  } catch {
    return {
      ok: false,
      eventId,
      connectionId: event.connection_id,
      httpStatus: 500,
      message:
        "O n8n respondeu, mas o resultado não pôde ser persistido. Não declare a conexão concluída; reenvie para verificar o mesmo evento.",
    };
  }

  if (persisted.stale) {
    return {
      ok: true,
      eventId,
      connectionId: event.connection_id,
      kind: "stale",
      status: persisted.status ?? undefined,
      message:
        "A resposta pertence a uma ação anterior. O estado mais recente foi preservado.",
    };
  }
  if (persisted.status && persisted.applied) {
    return {
      ok: true,
      eventId,
      connectionId: event.connection_id,
      kind: "completed",
      status: persisted.status,
      message:
        parsed.data.message ?? "Resultado confirmado e salvo com sucesso.",
    };
  }
  return {
    ok: true,
    eventId,
    connectionId: event.connection_id,
    kind: "received",
    message:
      parsed.data.message ??
      "Evento recebido pelo n8n. O resultado da Evolution ainda não foi confirmado; o estado permanece aguardando.",
  };
}
