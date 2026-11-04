import type { Conversation, Lead } from "@/domain/schemas";
export type QuickFilter = "all" | "reply" | "customer";
export function lastMessage(conversation: Conversation) {
  return [...conversation.messages]
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
}
export function waitingFor(conversation: Conversation): QuickFilter {
  const last = lastMessage(conversation);
  return last ? (last.direction === "inbound" ? "reply" : "customer") : "all";
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
export function contactName(lead: Lead, conversation: Conversation) {
  return (
    lead.name.trim() ||
    conversation.name.trim() ||
    lead.contact?.phone ||
    "Contato sem nome"
  );
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
