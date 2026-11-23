import { timingSafeEqual } from "node:crypto";
import { MetaError } from "@/features/paid-media/meta";
import {
  getMetaAccess,
  scheduledMetaOrganization,
} from "@/features/paid-media/meta-credentials";
import { paidMediaAdmin, reportFailure } from "@/features/paid-media/server";
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

  try {
    const admin = paidMediaAdmin();
    const org = await scheduledMetaOrganization(admin);
    if (!org)
      return json(
        {
          error:
            "Cadastre a credencial Meta ou selecione a organização da sincronização no servidor.",
        },
        503,
      );
    const result = await syncLinkedMetaAccounts(
      admin,
      org,
      await getMetaAccess(admin, org),
    );
    const ok = result.failed === 0 && !result.timeLimitReached;
    return json({ ok, ...result }, ok ? 200 : 502);
  } catch (cause) {
    if (cause instanceof MetaError)
      return json({ error: cause.message }, cause.status);
    const { error, status } = reportFailure(cause);
    return json({ error }, status);
  }
}
