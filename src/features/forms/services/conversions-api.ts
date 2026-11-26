import "server-only";
import { createHash } from "node:crypto";

export async function sendFormLead(request: Request, slug: string, pixel: string, eventId: string, contacts: { email: string; phone: string }) {
  const token = process.env.ATENDHUB_CAPI_TOKEN;
  const origin = new URL(request.url);
  if (!token || pixel !== process.env.ATENDHUB_CAPI_PIXEL_ID ||
      origin.hostname !== process.env.ATENDHUB_CAPI_HOST || origin.protocol !== "https:") return;

  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const email = contacts.email.trim().toLowerCase();
  const phone = contacts.phone.replace(/\D/g, "");
  if (!email && !phone) return;
  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: new URL("/f/" + encodeURIComponent(slug), origin.origin).href,
    user_data: {
      ...(email && { em: [hash(email)] }),
      ...(phone && { ph: [hash(phone)] }),
      client_user_agent: request.headers.get("user-agent") ?? undefined,
    },
  };
  try {
    const result = await fetch(`https://graph.facebook.com/v23.0/${pixel}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event], test_event_code: process.env.ATENDHUB_CAPI_TEST_CODE || undefined }),
      signal: AbortSignal.timeout(4000),
    });
    if (!result.ok) console.warn("[form-capi] Meta recusou o evento", result.status);
  } catch {
    console.warn("[form-capi] Falha de conexão com a Meta");
  }
}
