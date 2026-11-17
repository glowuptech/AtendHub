import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { deliverSignedWebhook } from "@/lib/webhooks/delivery";
export async function whatsappAuth() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth;
  if (auth.role !== "super_admin")
    return {
      error: NextResponse.json(
        { error: "Somente superadministradores podem gerenciar as conexões." },
        { status: 403 },
      ),
    } as const;
  return auth;
}
export function integrationAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("INTEGRATION_SERVER_UNCONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function dispatchConnectionEvent(
  auth: Exclude<Awaited<ReturnType<typeof whatsappAuth>>, { error: unknown }>,
  eventId: string,
) {
  const { data: event, error } = await auth.supabase
    .from("atendhub_whatsapp_events")
    .select("id,payload,attempts,delivery_status")
    .eq("id", eventId)
    .eq("organization_id", auth.organizationId)
    .single();
  if (error || !event) throw error ?? new Error("EVENT_NOT_FOUND");
  if (event.delivery_status === "delivered") return "delivered";
  const { data: settings, error: settingsError } = await auth.supabase
    .from("atendhub_webhook_settings")
    .select("config")
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const url =
    settings?.config?.whatsappConnection ||
    process.env.ATENDHUB_WHATSAPP_CONNECTION_WEBHOOK_URL;
  const secret = process.env.ATENDHUB_WHATSAPP_WEBHOOK_SECRET;
  if (!url || !secret) return "unconfigured";
  // Check secure server configuration before making any external call.
  const admin = integrationAdmin();
  const result = await deliverSignedWebhook(
    event.id,
    JSON.stringify(event.payload),
    { url, secret },
    event.attempts,
  );
  const { error: saveError } = await admin
    .from("atendhub_whatsapp_events")
    .update({
      delivery_status: result.status === "delivered" ? "delivered" : "retry",
      attempts: event.attempts + 1,
      delivered_at:
        result.status === "delivered" ? new Date().toISOString() : null,
    })
    .eq("id", event.id)
    .eq("organization_id", auth.organizationId);
  if (saveError) throw saveError;
  return result.status;
}
