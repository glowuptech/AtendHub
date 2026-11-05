/** Server adapter. Never imported by browser components. A future durable worker calls this. */
import { createHmac } from "node:crypto";
import type { CaptureEvent } from "@/features/forms/services/capture";
export async function deliverCaptureEvent(
  event: CaptureEvent,
  config: { url?: string; secret?: string },
  transport: typeof fetch = fetch,
) {
  const body = JSON.stringify({
    id: event.id,
    schemaVersion: event.schemaVersion,
    eventType: event.eventType,
    organizationId: event.organizationId,
    clientId: event.clientId,
    formId: event.formId,
    versionId: event.versionId,
    leadId: event.leadId,
    occurredAt: event.occurredAt,
  });
  return deliverSignedWebhook(
    event.id,
    body,
    config,
    event.attempts,
    transport,
  );
}
export async function deliverSignedWebhook(
  id: string,
  body: string,
  config: { url?: string; secret?: string },
  attempts = 0,
  transport: typeof fetch = fetch,
) {
  if (!config.url) return { status: "unconfigured" as const };
  const url = new URL(config.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Webhook exige HTTPS sem credenciais na URL");
  if (!config.secret) throw Error("Configure a assinatura do webhook");
  try {
    const response = await transport(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": id,
        "X-AtendHub-Signature": createHmac("sha256", config.secret)
          .update(body)
          .digest("hex"),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { status: "delivered" as const };
  } catch {
    /* Retry without logging payloads or credentials. */
  }
  return {
    status: "retry" as const,
    nextAttemptAt: new Date(
      Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7)),
    ).toISOString(),
  };
}
export function configuredWebhook() {
  return {
    url: process.env.ATENDHUB_WEBHOOK_URL,
    secret: process.env.ATENDHUB_WEBHOOK_SECRET,
  };
}
