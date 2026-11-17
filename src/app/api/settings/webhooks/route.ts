import { NextResponse } from "next/server";
import { whatsappAuth } from "@/features/whatsapp/server";
import {
  emptyWebhookConfig,
  WebhookConfigSchema,
} from "@/features/webhooks/config";
import { apiError } from "@/lib/supabase/organization-admin";
export async function GET() {
  const auth = await whatsappAuth();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("atendhub_webhook_settings")
    .select("config")
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (error) return apiError(error, 500);
  return NextResponse.json({ ...emptyWebhookConfig(), ...data?.config });
}
export async function PUT(request: Request) {
  const auth = await whatsappAuth();
  if ("error" in auth) return auth.error;
  const parsed = WebhookConfigSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const { error } = await auth.supabase
    .from("atendhub_webhook_settings")
    .upsert(
      {
        organization_id: auth.organizationId,
        config: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (error) return apiError(error, 500);
  return NextResponse.json(parsed.data);
}
