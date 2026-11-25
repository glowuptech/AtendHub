import useSWR from "swr";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/layout/shared";
import { daysBetween } from "@/lib/date-range";
import { money } from "@/features/paid-media/format";
import type { MediaReport } from "@/features/paid-media/model";
import { reportPath, requestMedia } from "@/features/paid-media/transport";
import type { OverviewRange } from "../services/overview";

export function ClientMediaSpend({
  clientId,
  range,
  onDashboard,
}: {
  clientId: string;
  range: OverviewRange;
  onDashboard: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<MediaReport>(
    reportPath(range, clientId),
    requestMedia,
    { revalidateOnFocus: false },
  );
  const days = daysBetween(range.from, range.to) + 1;
  const spending =
    data?.totals.filter(({ currency }) =>
      data.accounts.some(
        (account) => account.currency === currency && account.coveredDays > 0,
      ),
    ) ?? [];
  const partial = !!data?.accounts.some(
    (account) => account.coveredDays < days,
  );
  return (
    <Card className="client-media-spend">
      <div className="metric-top">
        <span>Investimento em tráfego pago</span>
        <Wallet size={18} aria-hidden="true" />
      </div>
      {isLoading && <small role="status">Carregando investimento…</small>}
      {error ? (
        <>
          <small role="alert">{error.message}</small>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            Tentar novamente
          </Button>
        </>
      ) : (
        data && (
          <>
            {spending.length > 0 ? (
              <>
                {spending.map(({ currency, spend }) => (
                  <strong key={currency} className="metric-value">
                    {money(spend, currency)}
                  </strong>
                ))}
                <small>
                  {partial
                    ? "Meta Ads · período parcialmente sincronizado"
                    : "Meta Ads · período selecionado"}
                </small>
              </>
            ) : (
              <>
                <strong className="metric-value">—</strong>
                <small>
                  {!data.accounts.length
                    ? "Nenhuma conta de anúncios vinculada."
                    : !data.campaigns.length
                      ? "Nenhuma campanha vinculada ao cliente."
                      : "O período ainda não foi sincronizado."}
                </small>
              </>
            )}
          </>
        )
      )}
      <Button size="sm" variant="outline" onClick={onDashboard}>
        Ver dashboard de tráfego pago
      </Button>
    </Card>
  );
}
