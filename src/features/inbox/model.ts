import { z } from "zod";

export type MessageStatus =
  | "received"
  | "pending"
  | "uncertain"
  | "failed"
  | "sent"
  | "delivered"
  | "read";

export type InboxConnection = {
  id: string;
  name: string;
  phone: string;
  status: string;
};

export type InboxConversation = {
  id: string;
  leadId: string;
  clientId: string;
  clientName: string;
  operationCode: string;
  operationName: string;
  connection: InboxConnection;
  contactName: string;
  phone: string;
  stage: string;
  source: string;
  ownerId: string | null;
  ownerName?: string | null;
  mine: boolean;
  professionalName: string | null;
  status: "open" | "closed";
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  canSend: boolean;
  sendBlockedReason: string | null;
};

export type InboxMedia = {
  mimetype?: string;
  fileName?: string;
  fileLength?: number;
  seconds?: number;
  caption?: string;
  width?: number;
  height?: number;
  pageCount?: number;
};

export type InboxMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  origin: "contact" | "inbox" | "external_device";
  type: string;
  body: string;
  media: InboxMedia;
  occurredAt: string;
  status: MessageStatus;
  failureReason: string | null;
  mine: boolean;
  requestId: string | null;
};

export type SendOutcome =
  | { outcome: "sent"; providerMessageId: string }
  | { outcome: "failed"; reason: string }
  | { outcome: "uncertain"; reason: string };

const sendResponse = z.object({
  ok: z.boolean(),
  messageId: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(500).optional(),
});

function unwrap(input: unknown) {
  let value = input;
  for (let depth = 0; depth < 4; depth++) {
    if (Array.isArray(value)) {
      if (value.length !== 1) throw new Error("multiple");
      value = value[0];
    } else if (
      typeof value === "object" &&
      value !== null &&
      "Final" in value
    ) {
      value = (value as { Final: unknown }).Final;
    } else if (typeof value === "string") {
      value = JSON.parse(value);
    } else break;
  }
  return z.record(z.string(), z.unknown()).parse(value);
}

/**
 * Interprets the n8n "Respond to Webhook" result. A message is only "sent" when the workflow
 * explicitly confirms ok=true with the real provider messageId; any other shape is uncertain.
 */
export function interpretSendResponse(
  httpOk: boolean,
  bodyText: string,
): SendOutcome {
  let parsed: z.infer<typeof sendResponse>;
  try {
    const raw = unwrap(JSON.parse(bodyText));
    parsed = sendResponse.parse({
      ok: raw.ok ?? raw.success,
      messageId: raw.messageId ?? raw.message_id ?? undefined,
      status: raw.status ?? undefined,
      message: raw.message ?? undefined,
    });
  } catch {
    return {
      outcome: "uncertain",
      reason:
        "O n8n não devolveu um resultado válido. Confirme no WhatsApp antes de reenviar.",
    };
  }
  if (!parsed.ok)
    return {
      outcome: "failed",
      reason: parsed.message ?? "O n8n informou falha no envio.",
    };
  if (
    !httpOk ||
    !parsed.messageId ||
    (parsed.status && parsed.status !== "sent")
  )
    return {
      outcome: "uncertain",
      reason:
        "O n8n não confirmou o envio com o ID da mensagem. Confirme no WhatsApp antes de reenviar.",
    };
  return { outcome: "sent", providerMessageId: parsed.messageId };
}
