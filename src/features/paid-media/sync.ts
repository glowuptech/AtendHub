import "server-only";
import { shiftDay } from "@/lib/date-range";
import { fetchMetaSnapshot, MetaError, type MetaAccess } from "./meta";
import {
  readMetaCredentialStatus,
  scheduledMetaOrganization,
} from "./meta-credentials";
import type { MetaAutoSyncStatus } from "./model";
import { allRows, MediaError, paidMediaAdmin } from "./server";

type Admin = ReturnType<typeof paidMediaAdmin>;
type AutoSyncJob = { account_id: string; timezone: string; started_at: string };

export async function importMetaPeriod(
  admin: Admin,
  org: string,
  access: MetaAccess,
  account: string,
  range: { from: string; to: string },
  started = new Date().toISOString(),
  signal?: AbortSignal,
) {
  const snapshot = await fetchMetaSnapshot(
    access,
    account,
    range.from,
    range.to,
  );
  const publish = admin.rpc("atendhub_meta_import", {
    p_org: org,
    p_account: account,
    p_from: range.from,
    p_to: range.to,
    p_started: started,
    p_campaigns: snapshot.campaigns,
    p_ads: snapshot.ads,
    p_insights: snapshot.insights,
  });
  const { data, error } = await (signal
    ? publish.abortSignal(signal)
    : publish);
  if (error?.message.includes("ACCOUNT_NOT_LINKED"))
    throw new MediaError("A conta precisa estar vinculada a um cliente.", 409);
  if (error) throw error;
  return { imported: data === true, rows: snapshot.insights.length };
}

export async function readAutoSyncStatus(
  org: string,
): Promise<MetaAutoSyncStatus> {
  const admin = paidMediaAdmin();
  const rows = await allRows<{
    account_id: string;
    auto_sync_started_at: string | null;
    auto_sync_finished_at: string | null;
    auto_sync_error: string | null;
  }>((from, to) =>
    admin
      .from("atendhub_meta_accounts")
      .select(
        "account_id,auto_sync_started_at,auto_sync_finished_at,auto_sync_error",
      )
      .eq("organization_id", org)
      .order("account_id")
      .range(from, to),
  );
  const cutoff = Date.now() - 6 * 60_000;
  const configured =
    !!process.env.CRON_SECRET &&
    (await scheduledMetaOrganization(admin)) === org &&
    (await readMetaCredentialStatus(admin, org)).configured;
  return {
    configured,
    accounts: rows.map((row) => {
      let state: MetaAutoSyncStatus["accounts"][number]["state"] = "pending";
      if (row.auto_sync_finished_at)
        state = row.auto_sync_error ? "failed" : "succeeded";
      else if (row.auto_sync_started_at)
        state =
          Date.parse(row.auto_sync_started_at) < cutoff
            ? "interrupted"
            : "syncing";
      return {
        accountId: row.account_id,
        lastAttemptAt: row.auto_sync_started_at,
        state,
        error: row.auto_sync_error,
      };
    }),
  };
}

async function syncClaim(
  admin: Admin,
  org: string,
  access: MetaAccess,
  job: AutoSyncJob,
) {
  let message: string | null = null;
  let imported = false;
  try {
    const to = new Intl.DateTimeFormat("en-CA", {
      timeZone: job.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(job.started_at));
    ({ imported } = await importMetaPeriod(
      admin,
      org,
      access,
      job.account_id,
      { from: shiftDay(to, -7), to },
      job.started_at,
      AbortSignal.timeout(52_000),
    ));
  } catch (cause) {
    message =
      cause instanceof MetaError || cause instanceof MediaError
        ? cause.message
        : cause instanceof RangeError
          ? "Confira o fuso horário registrado na conta Meta."
          : "Falha ao importar as métricas. Verifique a execução na hospedagem.";
  }

  const { data, error } = await admin
    .rpc("atendhub_meta_auto_sync_finish", {
      p_org: org,
      p_account: job.account_id,
      p_started: job.started_at,
      p_error: message,
    })
    .abortSignal(AbortSignal.timeout(8_000));
  if (error) {
    console.warn("[meta-sync] failed to record attempt", { code: error.code });
    return "failed";
  }
  if (!data) return "superseded";
  return message ? "failed" : imported ? "imported" : "superseded";
}

export async function syncLinkedMetaAccounts(
  admin: Admin,
  org: string,
  access: MetaAccess,
) {
  const result = {
    imported: 0,
    failed: 0,
    superseded: 0,
    timeLimitReached: false,
  };
  // Leave time for the last batch within the route's 300-second limit.
  const deadline = Date.now() + 225_000;
  while (Date.now() < deadline) {
    const { data, error } = await admin
      .rpc("atendhub_meta_auto_sync_claim", { p_org: org, p_limit: 4 })
      .abortSignal(AbortSignal.timeout(8_000));
    if (error) throw error;
    const jobs = (data ?? []) as AutoSyncJob[];
    if (!jobs.length) return result;
    const outcomes = await Promise.allSettled(
      jobs.map((job) => syncClaim(admin, org, access, job)),
    );
    for (const outcome of outcomes) {
      result[outcome.status === "fulfilled" ? outcome.value : "failed"]++;
    }
  }
  result.timeLimitReached = true;
  return result;
}
