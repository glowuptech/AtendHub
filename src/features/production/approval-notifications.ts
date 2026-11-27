import { publicOrigin } from "@/features/client-domains/server";
import { destinationUrl, integrationAdmin } from "@/features/whatsapp/server";

type Notification = {
  id: string;
  task_id: string;
  title: string;
  organization_id: string;
  client_id: string;
  requested_at: string;
  slug: string;
  destination: string;
  attempt: number;
};

export async function deliverApprovalNotifications(
  taskId: string | null = null,
) {
  const db = integrationAdmin();
  const claim = await db.rpc("atendhub_claim_approval_notifications", {
    p_task: taskId,
  });
  if (claim.error)
    throw new Error("Falha ao reservar notificações de aprovação.");
  const rows = claim.data as Notification[];
  await Promise.all(
    rows.map(async (row) => {
      const url = destinationUrl(row.destination);
      const origin = publicOrigin({ slug: row.slug, active: true });
      const response =
        url &&
        (await fetch(url, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": row.id,
          },
          body: JSON.stringify({
            id: row.id,
            eventType: "production.approval.requested",
            schemaVersion: 1,
            organizationId: row.organization_id,
            clientId: row.client_id,
            taskId: row.task_id,
            title: row.title,
            approvalId: row.id,
            occurredAt: row.requested_at,
            approvalUrl: origin + "/portal/aprovacoes#versao-" + row.id,
          }),
        }).catch(() => null));
      const update = response?.ok
        ? { notified_at: new Date().toISOString() }
        : {
            notify_after: new Date(
              Date.now() +
                Math.min(3600000, 60000 * 2 ** Math.min(row.attempt, 6)),
            ).toISOString(),
          };
      const ack = await db
        .from("atendhub_production_approvals")
        .update(update)
        .eq("id", row.id)
        .eq("notify_attempts", row.attempt)
        .eq("status", "pending");
      if (ack.error)
        throw new Error("Falha ao registrar a entrega da notificação.");
    }),
  );
  return rows.length;
}
