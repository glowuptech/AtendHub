import { integrationAdmin } from "@/features/whatsapp/server";

export async function deliverAppointmentResponse(id: string) {
  const configured = process.env.ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_URL;
  if (!configured) return;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return;
    const admin = integrationAdmin();
    const { data, error } = await admin.rpc(
      "atendhub_claim_appointment_response",
      { p_id: id },
    );
    if (error || !data) return;

    const secret = process.env.ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_TOKEN;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": id,
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(data),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok)
      await admin.rpc("atendhub_ack_appointment_response", { p_id: id });
  } catch {
    // The stored event remains eligible after the lease expires.
  }
}
