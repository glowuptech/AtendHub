import "server-only";
import type { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import {
  destinationUrl,
  enrichConnectionPayload,
  integrationAdmin,
} from "@/features/whatsapp/server";
import {
  interpretSendResponse,
  type InboxConversation,
  type InboxMedia,
  type InboxMessage,
  type MessageStatus,
  type SendOutcome,
} from "./model";

export type InboxAuth = Exclude<
  Awaited<ReturnType<typeof sessionOrganizationContext>>,
  { error: unknown }
>;

const SEND_TIMEOUT_MS = 30_000;
const STALE_PENDING_MS = 30_000;
export const MESSAGE_PAGE_SIZE = 50;

export class InboxError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type RpcError = { code?: string; message?: string };

function mapSendError(error: RpcError) {
  const text = error.message ?? "";
  if (
    error.code === "42501" ||
    /FORBIDDEN|NOT_AUTHENTICATED/.test(text)
  )
    return new InboxError(
      "Você não tem permissão para enviar nesta conversa.",
      403,
    );
  if (text.includes("CONNECTION_NOT_READY"))
    return new InboxError(
      "A conexão do WhatsApp não está conectada. O envio está indisponível.",
      409,
    );
  if (text.includes("REQUEST_ID_CONFLICT"))
    return new InboxError(
      "Esta solicitação já foi usada com outro conteúdo.",
      409,
    );
  if (text.includes("INVALID_BODY"))
    return new InboxError("A mensagem deve ter de 1 a 6.000 caracteres.", 400);
  return new InboxError("Não foi possível registrar a mensagem.", 500);
}

type ConversationRow = {
  id: string;
  organization_id: string;
  client_id: string;
  connection_id: string;
  lead_id: string;
  phone: string;
  status: "open" | "closed";
  last_message_at: string | null;
  last_message_preview: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unread_count: number;
  created_at: string;
};

const conversationColumns =
  "id,organization_id,client_id,connection_id,lead_id,phone,status,last_message_at,last_message_preview,last_inbound_at,last_outbound_at,unread_count,created_at";

/**
 * Lists the conversations visible to the session user. Conversation and lead rows come
 * through the user's session (RLS); only the non-sensitive connection label/status, which
 * attendants cannot read directly, is resolved with the server key for visible rows.
 */
export async function listConversations(
  auth: InboxAuth,
): Promise<InboxConversation[]> {
  const { data, error } = await auth.supabase
    .from("atendhub_inbox_conversations")
    .select(conversationColumns)
    .eq("organization_id", auth.organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(300);
  if (error) throw new InboxError("Não foi possível carregar as conversas.", 500);
  const rows = (data ?? []) as ConversationRow[];
  if (!rows.length) return [];

  const leadIds = [...new Set(rows.map((r) => r.lead_id))];
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const connectionIds = [...new Set(rows.map((r) => r.connection_id))];
  const [leads, clients, connections] = await Promise.all([
    auth.supabase
      .from("atendhub_leads")
      .select("id,name,phone,stage,source,owner_id,professional_id")
      .in("id", leadIds),
    auth.supabase
      .from("atendhub_clients")
      .select("id,name,operation_id")
      .in("id", clientIds),
    integrationAdmin()
      .from("atendhub_whatsapp_connections")
      .select("id,name,phone,status")
      .eq("organization_id", auth.organizationId)
      .in("id", connectionIds),
  ]);
  if (leads.error || clients.error || connections.error)
    throw new InboxError("Não foi possível carregar as conversas.", 500);

  const operationIds = [
    ...new Set((clients.data ?? []).map((c) => c.operation_id as string)),
  ];
  const professionalIds = [
    ...new Set(
      (leads.data ?? [])
        .map((l) => l.professional_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [operations, professionals] = await Promise.all([
    operationIds.length
      ? auth.supabase
          .from("atendhub_operations")
          .select("id,code,name")
          .in("id", operationIds)
      : { data: [], error: null },
    professionalIds.length
      ? auth.supabase
          .from("atendhub_professionals")
          .select("id,name")
          .in("id", professionalIds)
      : { data: [], error: null },
  ]);

  const leadById = new Map((leads.data ?? []).map((l) => [l.id as string, l]));
  const clientById = new Map(
    (clients.data ?? []).map((c) => [c.id as string, c]),
  );
  const connectionById = new Map(
    (connections.data ?? []).map((c) => [c.id as string, c]),
  );
  const operationById = new Map(
    (operations.data ?? []).map((o) => [o.id as string, o]),
  );
  const professionalById = new Map(
    (professionals.data ?? []).map((p) => [p.id as string, p]),
  );

  return rows.flatMap((row) => {
    const lead = leadById.get(row.lead_id);
    const client = clientById.get(row.client_id);
    const connection = connectionById.get(row.connection_id);
    if (!lead || !client || !connection) return [];
    const operation = operationById.get(client.operation_id as string);
    const mine = lead.owner_id === auth.userId;
    const connected = connection.status === "connected";
    return [
      {
        id: row.id,
        leadId: row.lead_id,
        clientId: row.client_id,
        clientName: client.name as string,
        operationCode: (operation?.code as string | undefined) ?? "",
        operationName: (operation?.name as string | undefined) ?? "",
        connection: {
          id: connection.id as string,
          name: connection.name as string,
          phone: connection.phone as string,
          status: connection.status as string,
        },
        contactName:
          (lead.name as string).trim() || `+${row.phone}`,
        phone: row.phone,
        stage: lead.stage as string,
        source: lead.source as string,
        ownerId: (lead.owner_id as string | null) ?? null,
        mine,
        professionalName:
          (professionalById.get(lead.professional_id as string)?.name as
            | string
            | undefined) ?? null,
        status: row.status,
        unreadCount: row.unread_count,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: row.last_message_preview,
        lastInboundAt: row.last_inbound_at,
        lastOutboundAt: row.last_outbound_at,
        createdAt: row.created_at,
        canSend: mine && connected,
        sendBlockedReason: !mine
          ? "Somente o responsável pelo lead pode responder."
          : connected
            ? null
            : "WhatsApp desconectado · envio indisponível",
      },
    ];
  });
}

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  origin: "contact" | "inbox" | "external_device";
  message_type: string;
  body: string;
  media: InboxMedia;
  occurred_at: string;
  status: MessageStatus;
  failure_reason: string | null;
  author_id: string | null;
  request_id: string | null;
};

function toMessage(row: MessageRow, userId: string): InboxMessage {
  const mine = row.origin === "inbox" && row.author_id === userId;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    origin: row.origin,
    type: row.message_type,
    body: row.body,
    media: row.media ?? {},
    occurredAt: row.occurred_at,
    status: row.status,
    failureReason: row.failure_reason,
    mine,
    requestId: mine ? row.request_id : null,
  };
}

export async function listMessages(
  auth: InboxAuth,
  conversationId: string,
  before?: string,
) {
  const { data: conversation } = await auth.supabase
    .from("atendhub_inbox_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) throw new InboxError("Conversa não encontrada.", 404);
  let query = auth.supabase
    .from("atendhub_inbox_messages")
    .select(
      "id,conversation_id,direction,origin,message_type,body,media,occurred_at,status,failure_reason,author_id,request_id",
    )
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);
  if (before) query = query.lt("occurred_at", before);
  const { data, error } = await query;
  if (error) throw new InboxError("Não foi possível carregar as mensagens.", 500);
  const rows = (data ?? []) as MessageRow[];
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  return {
    hasMore,
    messages: rows
      .slice(0, MESSAGE_PAGE_SIZE)
      .reverse()
      .map((row) => toMessage(row, auth.userId)),
  };
}

export async function markConversationRead(
  auth: InboxAuth,
  conversationId: string,
) {
  const { error } = await auth.supabase.rpc("atendhub_inbox_mark_read", {
    p_conversation_id: conversationId,
  });
  if (error)
    throw new InboxError(
      "Você não tem permissão para marcar esta conversa como lida.",
      error.code === "42501" ? 403 : 500,
    );
}

async function applyResult(
  admin: ReturnType<typeof integrationAdmin>,
  eventId: string,
  result: SendOutcome,
) {
  const { data, error } = await admin.rpc("atendhub_inbox_apply_send_result", {
    p_event_id: eventId,
    p_outcome: result.outcome,
    p_provider_message_id:
      result.outcome === "sent" ? result.providerMessageId : null,
    p_reason: result.outcome === "sent" ? null : result.reason,
  });
  if (error || !data) throw new Error("INBOX_RESULT_NOT_PERSISTED");
  return data as { messageId: string; status: MessageStatus };
}

export type SendResult = {
  messageId: string;
  status: MessageStatus;
  failureReason: string | null;
  existing: boolean;
};

/**
 * Registers a pending message plus the send event (authorization re-checked by the database
 * function with the user's session), then calls the saved n8n destination. The API key is read
 * on the server at this moment only and is never stored in the event history.
 */
export async function sendInboxMessage(
  auth: InboxAuth,
  input: { conversationId: string; requestId: string; body: string },
  transport: typeof fetch = fetch,
): Promise<SendResult> {
  const { data, error } = await auth.supabase.rpc(
    "atendhub_inbox_request_send",
    {
      p_conversation_id: input.conversationId,
      p_request_id: input.requestId,
      p_body: input.body,
    },
  );
  if (error || !data) throw mapSendError(error ?? {});
  const requested = data as {
    messageId: string;
    eventId: string;
    status: MessageStatus;
    existing: boolean;
  };

  const settled = (status: MessageStatus, reason: string | null = null) => ({
    messageId: requested.messageId,
    status,
    failureReason: reason,
    existing: requested.existing,
  });
  if (!["pending", "uncertain"].includes(requested.status))
    return settled(requested.status);

  let admin: ReturnType<typeof integrationAdmin>;
  try {
    admin = integrationAdmin();
  } catch {
    throw new InboxError(
      "A integração do servidor está indisponível. A mensagem continua pendente.",
      503,
    );
  }

  const { data: event, error: eventError } = await admin
    .from("atendhub_inbox_send_events")
    .select("id,payload,attempts,last_outcome,created_at")
    .eq("id", requested.eventId)
    .eq("organization_id", auth.organizationId)
    .single();
  if (eventError || !event)
    throw new InboxError("Evento de envio não encontrado.", 500);

  // Avoid a second delivery while another request for the same message is still in flight.
  const stalePending =
    event.attempts === 0 &&
    Date.now() - new Date(event.created_at as string).getTime() >
      STALE_PENDING_MS;
  const mayDispatch =
    !requested.existing ||
    requested.status === "uncertain" ||
    event.last_outcome === "failed" ||
    stalePending;
  if (!mayDispatch) return settled(requested.status);

  const fail = async (outcome: SendOutcome) => {
    try {
      const applied = await applyResult(admin, requested.eventId, outcome);
      return settled(
        applied.status,
        outcome.outcome === "sent" ? null : outcome.reason,
      );
    } catch {
      throw new InboxError(
        "O resultado do envio não pôde ser salvo. Tente novamente com a mesma solicitação.",
        500,
      );
    }
  };

  const { data: settings } = await admin
    .from("atendhub_webhook_settings")
    .select("config")
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  const url = destinationUrl(
    (settings?.config as { inboxMessages?: unknown } | null)?.inboxMessages,
  );
  if (!url)
    return fail({
      outcome: "failed",
      reason:
        "Configure a URL HTTPS em Configurações → Webhooks → Envio de mensagens do Inbox.",
    });

  const payload = event.payload as Record<string, unknown> & {
    connection?: { id?: string };
  };
  const connectionId = payload.connection?.id;
  if (typeof connectionId !== "string")
    return fail({ outcome: "failed", reason: "Evento sem conexão válida." });

  let outbound: Record<string, unknown>;
  try {
    outbound = await enrichConnectionPayload(
      admin,
      auth.organizationId,
      connectionId,
      payload,
    );
  } catch {
    return fail({
      outcome: "failed",
      reason: "Não foi possível preparar o envio com segurança.",
    });
  }

  let httpOk = false;
  let text = "";
  try {
    const response = await transport(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requested.eventId,
      },
      body: JSON.stringify(outbound),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    httpOk = response.ok;
    text = await response.text();
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      ["TimeoutError", "AbortError"].includes(cause.name);
    return fail({
      outcome: "uncertain",
      reason: timedOut
        ? "O n8n excedeu o tempo limite. A mensagem pode ter sido enviada; confirme no WhatsApp."
        : "Não foi possível confirmar a entrega ao n8n. A mensagem pode ter sido enviada.",
    });
  }
  if (text.length > 100_000)
    return fail({
      outcome: "uncertain",
      reason: "Resposta do n8n acima do tamanho permitido.",
    });
  return fail(interpretSendResponse(httpOk, text));
}
