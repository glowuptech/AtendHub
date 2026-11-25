export const defaultCompletionMessage = "Recebemos seu cadastro.";

// Match whole legacy templates so a client's own follow-up instructions are preserved.
const legacyMessages = new Set([
  "teste concluido nenhum atendimento real foi solicitado",
  "simulacao concluida nenhum dado foi enviado e nenhum lead foi criado",
  "demonstracao concluida nenhum dado foi enviado",
]);

export function completionMessage(message?: string) {
  if (!message?.trim()) return defaultCompletionMessage;
  const key = message
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^cadastro concluido /, "");
  return legacyMessages.has(key) ? defaultCompletionMessage : message;
}
