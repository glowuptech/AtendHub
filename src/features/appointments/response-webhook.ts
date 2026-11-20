import { destinationUrl, integrationAdmin } from "@/features/whatsapp/server";

export async function deliverAppointmentResponse(id: string) {
  try {
    const admin = integrationAdmin();
    const { data, error } = await admin.rpc(
      "atendhub_claim_appointment_response",
      { p_id: id },
    );
    if (error) {
      console.warn("[appointment-response] claim failed", {
        id,
        code: error.code,
      });
      return;
    }
    if (!data) return;

    const appointment = await admin
      .from("atendhub_appointments")
      .select("organization_id")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (appointment.error || !appointment.data) {
      console.warn("[appointment-response] organization lookup failed", { id });
      return;
    }
    const settings = await admin
      .from("atendhub_webhook_settings")
      .select("config")
      .eq("organization_id", appointment.data.organization_id)
      .maybeSingle();
    if (settings.error) {
      console.warn("[appointment-response] settings lookup failed", {
        id,
        code: settings.error.code,
      });
      return;
    }
    const fallback = destinationUrl(
      process.env.ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_URL,
    );
    const url =
      destinationUrl(settings.data?.config?.appointmentResponses) ?? fallback;
    if (!url) {
      console.warn("[appointment-response] destination missing", { id });
      return;
    }

    const secret =
      url.href === fallback?.href
        ? process.env.ATENDHUB_APPOINTMENT_RESPONSE_WEBHOOK_TOKEN
        : undefined;
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
    if (!response.ok) {
      console.warn("[appointment-response] webhook declined", {
        id,
        status: response.status,
      });
      return;
    }
    const ack = await admin.rpc("atendhub_ack_appointment_response", {
      p_id: id,
    });
    if (ack.error)
      console.warn("[appointment-response] ack failed", {
        id,
        code: ack.error.code,
      });
  } catch {
    console.warn("[appointment-response] delivery failed", { id });
  }
}
