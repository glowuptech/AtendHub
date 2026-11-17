import type { InboxConversation, InboxMessage } from "../model";

export type QuickFilter = "all" | "reply" | "customer" | "unread";

export function waitingFor(
  conversation: Pick<InboxConversation, "lastInboundAt" | "lastOutboundAt">,
): "reply" | "customer" | "none" {
  const { lastInboundAt, lastOutboundAt } = conversation;
  if (!lastInboundAt && !lastOutboundAt) return "none";
  if (!lastOutboundAt) return "reply";
  if (!lastInboundAt) return "customer";
  return lastInboundAt > lastOutboundAt ? "reply" : "customer";
}

export function matchesQuick(
  conversation: InboxConversation,
  quick: QuickFilter,
) {
  if (quick === "all") return true;
  if (quick === "unread") return conversation.unreadCount > 0;
  return waitingFor(conversation) === quick;
}

export function matchesSearch(
  query: string,
  values: (string | undefined | null)[],
) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const q = normalize(query.trim());
  const text = normalize(values.filter(Boolean).join(" "));
  return (
    text.includes(q) ||
    (/\d/.test(q) &&
      /^[+\d\s().-]+$/.test(q) &&
      text.replace(/\D/g, "").includes(q.replace(/\D/g, "")))
  );
}

export function previewText(message: Pick<InboxMessage, "body" | "type">) {
  if (message.body) return message.body;
  const labels: Record<string, string> = {
    image: "Imagem",
    video: "Vídeo",
    audio: "Áudio",
    document: "Documento",
    sticker: "Figurinha",
    location: "Localização",
    contact: "Contato",
  };
  return labels[message.type] ?? "Mensagem sem texto";
}

export const messageTime = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));

export const messageDay = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));

export const statusLabels: Record<string, string> = {
  received: "Recebida",
  pending: "Enviando…",
  uncertain: "Envio não confirmado",
  failed: "Falha no envio",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
};
