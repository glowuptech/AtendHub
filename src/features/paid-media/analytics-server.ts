import "server-only";
import { getMetaAccess } from "./meta-credentials";
import { fetchMetaAnalytics } from "./meta";
import type { MediaAnalytics } from "./model";
import { readReportScope, type Auth } from "./server";

export async function readMetaAnalytics(
  auth: Auth,
  range: { from: string; to: string },
  clientId?: string,
  portal = false,
): Promise<MediaAnalytics> {
  const scope = await readReportScope(auth, clientId);
  const linked = new Set(scope.visibleLinks.map((link) => link.account_id));
  const accounts = scope.accounts.filter((account) =>
    linked.has(account.account_id),
  );
  if (!accounts.length) return { accounts: [] };
  const access = await getMetaAccess(scope.admin, scope.org);
  const signal = AbortSignal.timeout(20_000);
  const fullAccount = scope.canManage && !clientId && !portal;
  const allowBilling = scope.canManage && !portal;
  const results = [];
  for (let index = 0; index < accounts.length; index += 3) {
    const batch = await Promise.all(
      accounts
        .slice(index, index + 3)
        .map((account) =>
          fetchMetaAnalytics(
            access,
            account,
            range,
            fullAccount
              ? null
              : scope.campaigns
                  .filter(
                    (campaign) =>
                      campaign.account_id === account.account_id &&
                      campaign.client_id,
                  )
                  .map((campaign) => campaign.campaign_id),
            allowBilling,
            signal,
          ),
        ),
    );
    results.push(...batch);
    if (signal.aborted) break;
  }
  return { accounts: results };
}
