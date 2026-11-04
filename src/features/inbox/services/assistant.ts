// UI boundary only. A future authenticated backend must resolve the client/base
// from conversationId; client IDs or knowledge from the browser are not authority.
export interface AssistantAnswer {
  conversationId: string;
  text: string;
  sources: { id: string; title: string; reference: string }[];
}
export interface AssistantService {
  available: boolean;
  ask(
    input: { conversationId: string; question: string },
    signal: AbortSignal,
  ): Promise<AssistantAnswer>;
}
export const unavailableAssistant: AssistantService = {
  available: false,
  async ask() {
    throw new Error("Assistente IA ainda não conectado.");
  },
};
