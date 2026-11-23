import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { metaConfigured } from "@/features/paid-media/meta";
import { reportFailure } from "@/features/paid-media/server";
import { syncLinkedMetaAccounts } from "@/features/paid-media/sync";

export const maxDuration = 300;

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "Agendamento indisponível." }, 503);

  const configured = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    received.length !== configured.length ||
    !timingSafeEqual(received, configured)
  )
    return json({ error: "Credencial de agendamento inválida." }, 401);

  const org = z.uuid().safeParse(process.env.ATENDHUB_META_ORGANIZATION_ID);
  if (!org.success || !metaConfigured(org.data))
    return json({ error: "Configure a credencial Meta no servidor." }, 503);

  try {
    const result = await syncLinkedMetaAccounts(org.data);
    const ok = result.failed === 0 && !result.timeLimitReached;
    return json({ ok, ...result }, ok ? 200 : 502);
  } catch (cause) {
    const { error, status } = reportFailure(cause);
    return json({ error }, status);
  }
}
