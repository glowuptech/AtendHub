import { formCapiSecret } from "@/features/forms/services/form-capi-secret";
import { createHash, timingSafeEqual } from "node:crypto";
import { integrationAdmin } from "@/features/whatsapp/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return new Response(null, { status: 401 });
  const db = integrationAdmin();
  const now = new Date().toISOString();
  const queue = db.from("atendhub_confirmed_purchases");
  const { data, error } = await queue
    .select("*")
    .is("sent_at", null)
    .lte("next_attempt", now)
    .gt("occurred_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("next_attempt")
    .limit(10);
  if (error) return new Response(null, { status: 503 });
  await Promise.all(
    (data ?? []).map(async (row) => {
      const lease = await queue
        .update({ next_attempt: new Date(Date.now() + 300000).toISOString() })
        .eq("appointment_id", row.appointment_id)
        .eq("next_attempt", row.next_attempt)
        .is("sent_at", null)
        .select("appointment_id")
        .maybeSingle();
      if (!lease.data) return;
      const { client_id: client, pixel_id: pixel } = row;
      const credential = await formCapiSecret(row.form_id, pixel);
      if (!credential) return;
      const { token, testCode } = credential;
      const [lead, service] = await Promise.all([
        db
          .from("atendhub_leads")
          .select("phone,email")
          .eq("id", row.lead_id)
          .eq("client_id", client)
          .maybeSingle(),
        db
          .from("atendhub_service_values")
          .select("amount_cents,currency")
          .eq("appointment_id", row.appointment_id)
          .eq("client_id", client)
          .maybeSingle(),
      ]);
      if (
        lead.error ||
        service.error ||
        !lead.data ||
        service.data?.amount_cents == null
      )
        return;
      const email = lead.data.email?.trim().toLowerCase();
      const phone = lead.data.phone?.replace(/\D/g, "");
      if (!email && !phone) return;
      const hash = (v: string) => createHash("sha256").update(v).digest("hex");
      const event = {
        event_name: "Purchase",
        event_id: `confirmed-${row.appointment_id}`,
        event_time: Math.floor(Date.parse(row.occurred_at) / 1000),
        action_source: "system_generated",
        user_data: {
          ...(email && { em: [hash(email)] }),
          ...(phone && { ph: [hash(phone)] }),
        },
        custom_data: {
          currency: service.data.currency,
          value: Number(service.data.amount_cents) / 100,
        },
      };
      const result = await fetch(
        `https://graph.facebook.com/v23.0/${pixel}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: [event],
            test_event_code: testCode,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (result.ok && (await result.json()).events_received === 1)
        await queue
          .update({ sent_at: new Date().toISOString() })
          .eq("appointment_id", row.appointment_id);
    }),
  );
  return Response.json({ checked: data?.length ?? 0 });
}
