export interface MessagingProvider {
  sendText(input: {
    clientId: string;
    connectionId: string;
    recipient: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ messageId: string; status: "queued" | "failed" }>;
}
export interface JobDispatcher {
  dispatch(outboxId: string): Promise<void>;
}
// Ports only: no Evolution, n8n, Supabase or Meta network implementation in C1.
