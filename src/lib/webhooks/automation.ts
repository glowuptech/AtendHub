/** Future authenticated server worker only. No caller or endpoint is enabled now. */
import type { Dispatch } from "@/features/automation/engine";
import { deliverSignedWebhook } from "./delivery";
export function automationDestination(event: Dispatch) {
  return event.eventType === "automation.stage_changed"
    ? "automations"
    : event.eventType === "followup.send_requested"
      ? "followups"
      : "reminders";
}
export function deliverAutomationEvent(
  event: Dispatch,
  config: { url?: string; secret?: string },
  attempts = 0,
  transport: typeof fetch = fetch,
) {
  // n8n resolves the job, recipient, template and authorized connection using the
  // identifiers. It must revalidate opt-out, schedule version and current state.
  return deliverSignedWebhook(
    event.dedupeKey,
    JSON.stringify(event),
    config,
    attempts,
    transport,
  );
}
export function configuredAutomationWebhook(event: Dispatch) {
  const key = automationDestination(event);
  return {
    url:
      key === "automations"
        ? process.env.ATENDHUB_AUTOMATIONS_WEBHOOK_URL
        : key === "followups"
          ? process.env.ATENDHUB_FOLLOWUP_WEBHOOK_URL
          : process.env.ATENDHUB_REMINDER_WEBHOOK_URL,
    secret: process.env.ATENDHUB_WEBHOOK_SECRET,
  };
}
