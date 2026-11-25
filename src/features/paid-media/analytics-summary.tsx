import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/layout/shared";
import { GenderChart, SegmentBars } from "./analytics-charts";
import { displayNumber, money, percent } from "./format";
import { cost, percentage } from "./metrics";
import type {
  MediaAnalytics,
  MediaReport,
  MetaAccountAnalytics,
  MetaDelivery,
  MetaSegment,
} from "./model";
import { endpoint, requestMedia } from "./transport";

const segmentMetrics = {
  impressions: "Impressões",
  linkClicks: "Cliques no link",
  formLeads: "Formulários Meta",
  spend: "Investimento",
} as const;
type SegmentMetric = keyof typeof segmentMetrics;
type ReportAccount = MediaReport["accounts"][number];
type DetailAccount = { account: ReportAccount; detail?: MetaAccountAnalytics };

const platformNames: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
  whatsapp: "WhatsApp",
};
const positionNames: Record<string, string> = {
  feed: "Feed",
  reels: "Reels",
  instagram_reels: "Reels",
  facebook_reels: "Reels",
  stories: "Stories",
  instagram_stories: "Stories",
  facebook_stories: "Stories",
  messenger_stories: "Stories",
  whatsapp_status: "Status",
  marketplace: "Marketplace",
  facebook_notification: "Notificações",
  instream_video: "Vídeo in-stream",
  search: "Busca",
  instagram_explore: "Explorar",
  right_hand_column: "Coluna direita",
};
function placementLabel(key: string) {
  if (key === "unknown") return "Sem informação";
  const [platform, position] = key.split(":");
  const platformLabel =
    platformNames[platform] ?? platform.replaceAll("_", " ");
  return position
    ? `${platformLabel} · ${positionNames[position] ?? position.replaceAll("_", " ")}`
    : platformLabel;
}
const ageLabel = (key: string) => (key === "unknown" ? "Sem informação" : key);
const genderLabel = (key: string) =>
  ({ female: "Feminino", male: "Masculino", unknown: "Sem informação" })[key] ??
  key;

function segmentData(
  accounts: DetailAccount[],
  key: "placements" | "ages" | "genders",
  metric: SegmentMetric,
  labelFor: (key: string) => string,
) {
  const sums = new Map<string, number>();
  let covered = 0;
  for (const { detail } of accounts) {
    const segments: MetaSegment[] | null | undefined = detail?.[key];
    if (
      !segments ||
      (segments.length && segments.every((row) => row[metric] === null))
    )
      continue;
    covered++;
    for (const row of segments) {
      const value = row[metric];
      if (value === null) continue;
      const label = labelFor(row.key);
      sums.set(label, (sums.get(label) ?? 0) + value);
    }
  }
  return {
    covered,
    data: [...sums].map(([label, value]) => ({ label, value })),
  };
}

function deliveryTotal(accounts: DetailAccount[], field: keyof MetaDelivery) {
  let sum = 0;
  for (const { detail } of accounts) {
    const value = detail?.delivery?.[field];
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

function Delivery({
  accounts,
  currency,
}: {
  accounts: DetailAccount[];
  currency: string;
}) {
  const reach = accounts.length === 1 ? deliveryTotal(accounts, "reach") : null;
  const spend = deliveryTotal(accounts, "spend");
  const impressions = deliveryTotal(accounts, "impressions");
  const clicks = deliveryTotal(accounts, "linkClicks");
  const engagement = deliveryTotal(accounts, "engagement");
  const stats = [
    ["Alcance", displayNumber(reach)],
    ["Cliques no link", displayNumber(clicks)],
    ["CTR do link", percent(percentage(clicks, impressions))],
    [
      "CPC do link",
      money(spend === null ? null : cost(spend, clicks), currency),
    ],
    [
      "Frequência",
      displayNumber(
        impressions === null ? null : rounded(cost(impressions, reach)),
      ),
    ],
    ["Engajamentos", displayNumber(engagement)],
    ["Taxa de engajamento", percent(percentage(engagement, impressions))],
  ];
  return (
    <Card title="Entrega e engajamento">
      <dl className="paid-values">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {accounts.length > 1 && (
        <>
          <p className="muted">
            Alcance e frequência por conta. A mesma pessoa pode aparecer em
            várias contas.
          </p>
          <ul className="paid-account-reach">
            {accounts.map(({ account, detail }) => {
              const row = detail?.delivery;
              const frequency =
                row?.impressions != null
                  ? rounded(cost(row.impressions, row.reach))
                  : null;
              return (
                <li key={account.account_id}>
                  <strong>{account.name}</strong>
                  <span>
                    Alcance {displayNumber(row?.reach ?? null)} · Frequência{" "}
                    {displayNumber(frequency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="muted">
        Dados da Meta para o período. A taxa de engajamento usa engajamentos
        sobre impressões.
      </p>
    </Card>
  );
}
const rounded = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;

function Audience({
  accounts,
  currency,
}: {
  accounts: DetailAccount[];
  currency: string;
}) {
  const [metric, setMetric] = useState<SegmentMetric>("impressions");
  const breakdowns = [
    { key: "genders", label: "Gênero", labelFor: genderLabel },
    { key: "placements", label: "Posicionamentos", labelFor: placementLabel },
    { key: "ages", label: "Faixas etárias", labelFor: ageLabel },
  ] as const;
  const format = (value: number) =>
    metric === "spend" ? money(value, currency) : displayNumber(value);
  return (
    <section className="paid-audience">
      <div className="paid-module-heading">
        <h2>Público e posicionamentos</h2>
        <label>
          Comparar por
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as SegmentMetric)}
          >
            {Object.entries(segmentMetrics).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="paid-audience-grid">
        {breakdowns.map(({ key, label, labelFor }) => {
          const { covered, data } = segmentData(
            accounts,
            key,
            metric,
            labelFor,
          );
          data.sort((a, b) =>
            key === "ages"
              ? a.label.localeCompare(b.label, "pt-BR", { numeric: true })
              : b.value - a.value,
          );
          return (
            <Card key={key} title={label}>
              {covered === 0 ? (
                <p className="muted">Métrica indisponível neste recorte.</p>
              ) : key === "genders" ? (
                <GenderChart data={data} format={format} />
              ) : (
                <SegmentBars
                  data={data}
                  format={format}
                  vertical={key === "ages"}
                />
              )}
              {covered > 0 && covered < accounts.length && (
                <p className="muted">
                  {covered} de {accounts.length} contas com dados neste gráfico.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Billing({
  accounts,
  clients,
}: {
  accounts: DetailAccount[];
  clients: MediaReport["clients"];
}) {
  const names = new Map(clients.map((client) => [client.id, client.name]));
  return (
    <Card title="Saldo e limites das contas">
      <div className="paid-table">
        <table className="table">
          <thead>
            <tr>
              {[
                "Conta de anúncios",
                "Cliente",
                "Limite de gastos",
                "Limite restante",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map(({ account, detail }) => {
              const billing = detail?.billing;
              return (
                <tr key={account.account_id}>
                  <td>
                    {account.name}
                    {account.shared && (
                      <div className="muted">
                        Compartilhada · total da conta
                      </div>
                    )}
                  </td>
                  <td>
                    {account.clientIds
                      .map((id) => names.get(id))
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {billing && billing.spendLimit === null
                      ? "Sem limite informado"
                      : money(billing?.spendLimit ?? null, account.currency)}
                  </td>
                  <td>
                    {money(billing?.remainingLimit ?? null, account.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        O limite restante é o quanto ainda pode ser gasto dentro do teto da
        conta. O saldo pré-pago está indisponível nesta integração.
      </p>
    </Card>
  );
}

export function AnalyticsModules({
  report,
  range,
  clientId,
  portal,
}: {
  report: MediaReport;
  range: { from: string; to: string };
  clientId: string;
  portal: boolean;
}) {
  const linked = report.accounts.filter(
    (account) => account.clientIds.length > 0,
  );
  const search = new URLSearchParams({ kind: "analytics", ...range });
  if (clientId) search.set("clientId", clientId);
  const { data, error, isLoading, mutate } = useSWR<MediaAnalytics>(
    linked.length ? `${endpoint}?${search}` : null,
    requestMedia,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 60_000,
    },
  );
  const byCurrency = new Map<string, DetailAccount[]>();
  const details = new Map(
    data?.accounts?.map((detail) => [detail.accountId, detail]),
  );
  const accounts = linked.map((account) => ({
    account,
    detail: details.get(account.account_id),
  }));
  for (const row of accounts) {
    const currency = row.account.currency;
    const list = byCurrency.get(currency) ?? [];
    list.push(row);
    byCurrency.set(currency, list);
  }
  if (!linked.length) return null;
  if (isLoading)
    return (
      <Card title="Indicadores da Meta">
        <p role="status">Consultando a Meta…</p>
      </Card>
    );
  if (error)
    return (
      <Card title="Indicadores da Meta">
        <p role="status">{error.message}</p>
        <Button variant="outline" onClick={() => mutate()}>
          Consultar novamente
        </Button>
      </Card>
    );
  return (
    <>
      {[...byCurrency].map(([currency, rows]) => (
        <div
          className="paid-live-modules"
          key={currency}
          aria-label={`Indicadores da Meta em ${currency}`}
        >
          {byCurrency.size > 1 && <h2>Indicadores da Meta em {currency}</h2>}
          <Delivery accounts={rows} currency={currency} />
          <Audience accounts={rows} currency={currency} />
        </div>
      ))}
      {report.canManage && !portal && (
        <Billing accounts={accounts} clients={report.clients} />
      )}
    </>
  );
}
