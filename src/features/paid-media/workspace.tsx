"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { endpoint, requestMedia } from "./transport";
import { MediaAssistant } from "./assistant";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, Heading, NavButton } from "@/components/layout/shared";
import { daysBetween, localDay, RangeSchema, shiftDay } from "@/lib/date-range";
import { addMetrics, cost, cpm, emptyMetrics, primaryResult } from "./metrics";
import {
  stageLabels,
  stageMetric,
  stages,
  type MediaReport,
  type Stage,
  type Campaign,
  type Metrics,
} from "./model";

export const displayNumber = (n: number | null) =>
  n === null ? "—" : new Intl.NumberFormat("pt-BR").format(n);
export const money = (n: number | null, currency: string) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
const readDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
const views = [
  "Resumo",
  "Funil AIDA",
  "Campanhas",
  "Criativos",
  "Contas vinculadas",
  "Atribuição do WhatsApp",
  "Assistente IA",
] as const;
type View = (typeof views)[number];
type Run = (value: unknown, success: string) => Promise<void>;

export function PaidMediaWorkspace({
  clientId,
  portal = false,
  embedded = false,
}: {
  clientId?: string;
  portal?: boolean;
  embedded?: boolean;
}) {
  const [today] = useState(() => localDay(new Date().toISOString()));
  const [range, setRange] = useState({ from: today, to: today });
  const [draft, setDraft] = useState(range);
  const [filter, setFilter] = useState(clientId ?? "");
  const [view, setView] = useState<View>("Resumo");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const options = useSWR<MediaReport>(
    clientId ? null : `${endpoint}?from=${today}&to=${today}`,
    requestMedia,
    { revalidateOnFocus: false },
  );
  const query = new URLSearchParams(range);
  if (filter) query.set("clientId", filter);
  const { data, error, isLoading, mutate } = useSWR<MediaReport>(
    `${endpoint}?${query}`,
    requestMedia,
    { keepPreviousData: false, revalidateOnFocus: false },
  );
  const canManage = !!data?.canManage && !portal;
  const clients = options.data?.clients ?? data?.clients ?? [];
  async function run(value: unknown, success: string) {
    if (pending) return;
    setPending(true);
    setNotice("");
    setProblem("");
    try {
      await requestMedia(endpoint, value);
      await Promise.all([mutate(), options.mutate()]);
      setNotice(success);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setPending(false);
    }
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    const result = RangeSchema.safeParse(draft);
    if (!result.success) {
      setProblem(result.error.issues[0]?.message ?? "Confira as datas.");
      return;
    }
    setProblem("");
    setRange(draft);
  }
  const activeView =
    !canManage &&
    (view === "Contas vinculadas" ||
      view === "Atribuição do WhatsApp" ||
      view === "Assistente IA")
      ? "Resumo"
      : view;
  return (
    <div className="paid-workspace">
      {!embedded && (
        <Heading
          eyebrow={portal ? "PORTAL" : "SISTEMA"}
          title="Tráfego pago"
          description="Investimento, campanhas, criativos e resultados por etapa do AIDA."
          action={
            !portal && (
              <NavButton
                href={`/app/planejamento-campanhas${filter ? "?clientId=" + filter : ""}`}
              >
                Planejamento de campanhas
              </NavButton>
            )
          }
        />
      )}
      <Card>
        <div className="actions" aria-label="Períodos rápidos">
          {[
            ["Hoje", 0],
            ["Ontem", 1],
            ["Últimos 7 dias", 6],
            ["Últimos 30 dias", 29],
          ].map(([label, days]) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              onClick={() => {
                const period = {
                  from: shiftDay(today, -Number(days)),
                  to: label === "Ontem" ? shiftDay(today, -1) : today,
                };
                setDraft(period);
                setRange(period);
                setProblem("");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <form onSubmit={apply} className="paid-filter">
          <label>
            De
            <input
              type="date"
              required
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              required
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          {!clientId && (
            <label>
              Cliente
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit">Aplicar período</Button>
        </form>
      </Card>
      {problem && (
        <p role="alert" className="field-error">
          {problem}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {isLoading && <p role="status">Carregando tráfego pago…</p>}
      {error && (
        <Card>
          <p role="alert">{error.message}</p>
          <Button variant="outline" onClick={() => mutate()}>
            Tentar novamente
          </Button>
        </Card>
      )}
      {data && !error && (
        <>
          <nav className="tabs" aria-label="Tráfego pago">
            {views
              .filter(
                (tab) =>
                  canManage ||
                  (tab !== "Contas vinculadas" &&
                    tab !== "Atribuição do WhatsApp" &&
                    tab !== "Assistente IA"),
              )
              .map((tab) => (
                <Button
                  key={tab}
                  variant={tab === activeView ? "default" : "ghost"}
                  aria-pressed={tab === activeView}
                  onClick={() => setView(tab)}
                >
                  {tab}
                </Button>
              ))}
          </nav>
          {activeView === "Resumo" && (
            <Summary
              data={data}
              days={daysBetween(range.from, range.to) + 1}
              portal={portal}
            />
          )}
          {activeView === "Funil AIDA" && <Funnel data={data} />}
          {activeView === "Campanhas" && (
            <Campaigns
              key={filter}
              data={data}
              canManage={canManage}
              run={run}
              pending={pending}
            />
          )}
          {activeView === "Criativos" && <Creatives data={data} />}
          {activeView === "Contas vinculadas" && (
            <Accounts
              key={filter}
              data={data}
              filter={filter}
              range={range}
              run={run}
              pending={pending}
            />
          )}
          {activeView === "Assistente IA" &&
            (filter ? (
              <MediaAssistant key={filter} clientId={filter} period={range} />
            ) : (
              <Card>
                <p>
                  Selecione um cliente para analisar as campanhas com o
                  assistente.
                </p>
              </Card>
            ))}
          {activeView === "Atribuição do WhatsApp" && (
            <WhatsAppRules
              key={filter}
              data={data}
              filter={filter}
              run={run}
              pending={pending}
            />
          )}
        </>
      )}
    </div>
  );
}

function Summary({
  data,
  days,
  portal,
}: {
  data: MediaReport;
  days: number;
  portal: boolean;
}) {
  const covered = data.accounts.some((a) => a.coveredDays > 0);
  const complete =
    data.accounts.length > 0 &&
    data.accounts.every((a) => a.coveredDays === days);
  const coveredCurrencies = [
    ...new Set(
      data.accounts.filter((a) => a.coveredDays > 0).map((a) => a.currency),
    ),
  ];
  const totals = coveredCurrencies.map(
    (currency) =>
      data.totals.find((row) => row.currency === currency) ?? {
        currency,
        ...emptyMetrics(),
      },
  );

  return (
    <>
      {!data.accounts.length && (
        <Card>
          <p>Nenhuma conta vinculada neste recorte.</p>
        </Card>
      )}
      {data.accounts.length > 0 && !covered && (
        <Card>
          <p>Este período ainda não foi sincronizado com a Meta.</p>
        </Card>
      )}
      {covered && !complete && (
        <p className="muted">
          A cobertura é parcial. Os valores refletem os dias importados.
        </p>
      )}
      {!data.attributionAvailable && (
        <p className="muted">A atribuição do CRM aguarda ativação no banco.</p>
      )}
      {covered &&
        totals.map((m) => (
          <Card key={m.currency} title={`Resumo em ${m.currency}`}>
            <dl className="paid-values">
              <Value title="Investimento">{money(m.spend, m.currency)}</Value>
              <Value title="Impressões">{displayNumber(m.impressions)}</Value>
              <Value title="CPM">{money(cpm(m), m.currency)}</Value>
              <Value title="Formulários instantâneos da Meta">
                {displayNumber(m.form_leads)}
              </Value>
              <Value title="Conversas de WhatsApp na Meta">
                {displayNumber(m.whatsapp_conversations)}
              </Value>
              <Value title="Custo por lead de formulário Meta">
                {money(cost(m.spend, m.form_leads), m.currency)}
              </Value>
              <Value title="Formulários Atend&Hub atribuídos">
                {data.attributionAvailable ? displayNumber(m.crmForms) : "—"}
              </Value>
              <Value title="WhatsApp atribuído no CRM">
                {data.attributionAvailable ? displayNumber(m.crmWhatsApp) : "—"}
              </Value>
              <Value title="Qualificadas no CRM">
                {data.attributionAvailable ? displayNumber(m.qualified) : "—"}
              </Value>
              <Value title="Oportunidades com agendamento">
                {data.attributionAvailable
                  ? displayNumber(m.appointments)
                  : "—"}
              </Value>
            </dl>
          </Card>
        ))}
      {data.accounts.length > 0 && (
        <Card title="Cobertura da sincronização">
          <Table
            headers={[
              "Conta",
              "Moeda e fuso da Meta",
              "Dias importados",
              "Última atualização no período",
            ]}
          >
            {data.accounts.map((a) => (
              <tr key={a.account_id}>
                <td>{a.name}</td>
                <td>
                  {a.currency} · {a.timezone}
                </td>
                <td>
                  {a.coveredDays} de {days}
                </td>
                <td>{a.latestSync ? readDate(a.latestSync) : "—"}</td>
              </tr>
            ))}
          </Table>
          <p className="muted">
            Dias e valores da Meta seguem o fuso e a moeda de cada conta. O CRM
            usa America/Sao_Paulo. O traço indica que a métrica não veio na
            importação.
          </p>
        </Card>
      )}
      {data.pending.length > 0 && (
        <Card title="Pendências de classificação">
          {data.pending.map((p) => (
            <p key={p.currency}>
              {p.campaigns} campanhas sem cliente · {money(p.spend, p.currency)}{" "}
              no período
            </p>
          ))}
        </Card>
      )}
      {covered && data.clients.length > 1 && (
        <Card title="Desempenho por cliente">
          <Table
            headers={[
              "Cliente",
              "Investimento",
              "Formulários Meta",
              "WhatsApp Meta",
              "CRM atribuído",
            ]}
          >
            {data.clients.flatMap((c) => {
              const byCurrency = byMoney(
                data.campaigns.filter((row) => row.client_id === c.id),
              );
              return [...byCurrency].map(([currency, m]) => (
                <tr key={c.id + currency}>
                  <td>
                    {portal ? (
                      c.name
                    ) : (
                      <Link href={`/app/trafego-pago?clientId=${c.id}`}>
                        {c.name}
                      </Link>
                    )}
                  </td>
                  <td>{money(m.spend, currency)}</td>
                  <td>{displayNumber(m.form_leads)}</td>
                  <td>{displayNumber(m.whatsapp_conversations)}</td>
                  <td>
                    {data.attributionAvailable
                      ? displayNumber(m.crmLeads)
                      : "—"}
                  </td>
                </tr>
              ));
            })}
          </Table>
        </Card>
      )}
    </>
  );
}
function Value({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="paid-table">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function byMoney(rows: MediaReport["campaigns"]) {
  const result = new Map<string, Metrics>();
  rows.forEach((r) =>
    result.set(
      r.currency,
      addMetrics(result.get(r.currency) ?? emptyMetrics(), r.metrics),
    ),
  );
  return result;
}
function Funnel({ data }: { data: MediaReport }) {
  if (!data.accounts.some((a) => a.coveredDays > 0))
    return (
      <Card>
        <p>Sincronize o período para analisar o funil.</p>
      </Card>
    );
  return (
    <div className="paid-grid">
      {stages.map((stage) => (
        <Card key={stage} title={stageLabels[stage]}>
          <p>{stageMetric[stage]}</p>
          {[
            ...byMoney(
              data.campaigns.filter((c) => c.stage === stage && c.client_id),
            ),
          ].map(([currency, m]) => (
            <dl className="paid-values" key={currency}>
              <Value title="Investimento">{money(m.spend, currency)}</Value>
              {stage === "DES" ? (
                <>
                  <Value title="Formulários instantâneos">
                    {displayNumber(m.form_leads)}
                  </Value>
                  <Value title="Conversas WhatsApp">
                    {displayNumber(m.whatsapp_conversations)}
                  </Value>
                </>
              ) : (
                <>
                  <Value title={stageMetric[stage]}>
                    {displayNumber(
                      stage === "ACA" && !data.attributionAvailable
                        ? null
                        : primaryResult(stage, m),
                    )}
                  </Value>
                  <Value title="Custo por resultado">
                    {money(
                      stage === "ACA" && !data.attributionAvailable
                        ? null
                        : cost(m.spend, primaryResult(stage, m)),
                      currency,
                    )}
                  </Value>
                </>
              )}
            </dl>
          ))}
          {!data.campaigns.some((c) => c.stage === stage && c.client_id) && (
            <p className="muted">Nenhuma campanha classificada nesta etapa.</p>
          )}
        </Card>
      ))}
      {data.campaigns.some((c) => c.client_id && !c.stage) && (
        <Card title="Sem etapa">
          {[
            ...byMoney(data.campaigns.filter((c) => c.client_id && !c.stage)),
          ].map(([currency, m]) => (
            <p key={currency}>{money(m.spend, currency)}</p>
          ))}
        </Card>
      )}
    </div>
  );
}
function Campaigns({
  data,
  canManage,
  run,
  pending,
}: {
  data: MediaReport;
  canManage: boolean;
  run: Run;
  pending: boolean;
}) {
  const [show, setShow] = useState("all");
  const [copy, setCopy] = useState("");
  const filtered = data.campaigns.filter(
    (c) =>
      show === "all" ||
      (show === "pending" ? !c.client_id || !c.stage : c.stage === show),
  );
  return (
    <Card title="Campanhas importadas">
      <label>
        Classificação
        <select value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="all">Todas</option>
          {canManage && <option value="pending">Revisar classificação</option>}
          {stages.map((s) => (
            <option key={s} value={s}>
              {stageLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Use a classificação para conciliar campanhas em contas compartilhadas. O
        parâmetro de campanha só atribui formulários do mesmo cliente.
      </p>
      {!filtered.length ? (
        <p>Nenhuma campanha neste recorte.</p>
      ) : (
        <Table
          headers={[
            "Campanha",
            "Cliente",
            "Etapa",
            "Investimento",
            "Resultados",
            "Ações",
          ]}
        >
          {filtered.map((c) => {
            const m = c.metrics;
            const account = data.accounts.find(
              (a) => a.account_id === c.account_id,
            );
            return (
              <tr key={c.campaign_id}>
                <td>
                  {c.name}
                  <br />
                  <small>
                    {account?.name} · {c.campaign_id}
                  </small>
                </td>
                <td>
                  {data.clients.find((client) => client.id === c.client_id)
                    ?.name ?? "Pendente de vínculo"}
                </td>
                <td>
                  {c.stage ? stageLabels[c.stage] : "Sem etapa"}
                  {c.manual && <small> · Manual</small>}
                </td>
                <td>
                  {account?.coveredDays ? money(m.spend, c.currency) : "—"}
                </td>
                <td>
                  Meta · Form.: {displayNumber(m.form_leads)} · WhatsApp:{" "}
                  {displayNumber(m.whatsapp_conversations)}
                  <br />
                  CRM ·{" "}
                  {data.attributionAvailable
                    ? `${displayNumber(m.crmLeads)} atribuídos · ${displayNumber(m.qualified)} qualificados`
                    : "—"}
                </td>
                <td>
                  {canManage && (
                    <Classification
                      campaign={c}
                      data={data}
                      run={run}
                      pending={pending}
                    />
                  )}
                  {canManage && c.client_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `meta_campaign_id=${c.campaign_id}`,
                          );
                          setCopy("Parâmetro copiado.");
                        } catch {
                          setCopy(`meta_campaign_id=${c.campaign_id}`);
                        }
                      }}
                    >
                      Copiar parâmetro
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {copy && <p role="status">{copy}</p>}
    </Card>
  );
}
function Classification({
  campaign: c,
  data,
  run,
  pending,
}: {
  campaign: Campaign;
  data: MediaReport;
  run: Run;
  pending: boolean;
}) {
  const account = data.accounts.find((a) => a.account_id === c.account_id);
  const [client, setClient] = useState(c.client_id ?? "");
  const [stage, setStage] = useState<Stage | "">(c.stage ?? "");
  return (
    <details>
      <summary>Classificar</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            {
              action: "classify",
              campaignId: c.campaign_id,
              clientId: client || null,
              stage: stage || null,
            },
            "Classificação salva.",
          );
        }}
      >
        <label>
          Cliente
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Pendente</option>
            {data.clients
              .filter((client) => account?.clientIds.includes(client.id))
              .map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Etapa
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage | "")}
          >
            <option value="">Sem etapa</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          Salvar classificação
        </Button>
      </form>
    </details>
  );
}
function Creatives({ data }: { data: MediaReport }) {
  const [stage, setStage] = useState("");
  const campaigns = new Map(data.campaigns.map((c) => [c.campaign_id, c]));
  const ads = data.ads.filter((ad) => !stage || ad.stage === stage);
  const [count, setCount] = useState(24);
  return (
    <>
      <Card>
        <label>
          Etapa
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setCount(24);
            }}
          >
            <option value="">Todas</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s]}
              </option>
            ))}
          </select>
        </label>
      </Card>
      {!ads.length && (
        <Card>
          <p>Nenhum criativo com dados no período.</p>
        </Card>
      )}
      <div className="paid-grid">
        {ads.slice(0, count).map((ad) => (
          <Card key={ad.ad_id} title={ad.name}>
            {ad.thumbnail /* eslint-disable-next-line @next/next/no-img-element -- Meta CDN URLs can be signed and change by creative. */ && (
              <img
                className="paid-creative"
                src={ad.thumbnail}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            <p className="muted">
              {campaigns.get(ad.campaign_id)?.name} ·{" "}
              {ad.stage ? stageLabels[ad.stage] : "Sem etapa"}
            </p>
            {ad.copy && (
              <details>
                <summary>Texto do anúncio</summary>
                <p className="preserve-lines">{ad.copy}</p>
              </details>
            )}
            <dl className="paid-values">
              <Value title="Investimento">
                {money(ad.metrics.spend, ad.currency)}
              </Value>
              <Value title="Impressões">
                {displayNumber(ad.metrics.impressions)}
              </Value>
              <Value title="CPM">{money(cpm(ad.metrics), ad.currency)}</Value>
              {ad.stage === "ATR" ||
              ad.stage === "INT" ||
              ad.stage === "ACA" ? (
                <Value title={stageMetric[ad.stage]}>
                  {displayNumber(
                    ad.stage === "ACA" && !data.attributionAvailable
                      ? null
                      : primaryResult(ad.stage, ad.metrics),
                  )}
                </Value>
              ) : (
                <>
                  <Value title="Formulários Meta">
                    {displayNumber(ad.metrics.form_leads)}
                  </Value>
                  <Value title="Conversas WhatsApp">
                    {displayNumber(ad.metrics.whatsapp_conversations)}
                  </Value>
                </>
              )}
            </dl>
          </Card>
        ))}
      </div>
      {ads.length > count && (
        <Button variant="outline" onClick={() => setCount(count + 24)}>
          Carregar mais criativos
        </Button>
      )}
    </>
  );
}
type Inventory = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
}[];
function Accounts({
  data,
  filter,
  range,
  run,
  pending,
}: {
  data: MediaReport;
  filter: string;
  range: { from: string; to: string };
  run: Run;
  pending: boolean;
}) {
  const [discover, setDiscover] = useState(false);
  const inventory = useSWR<Inventory>(
    discover ? `${endpoint}?kind=metaAccounts` : null,
    requestMedia,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [client, setClient] = useState(filter || data.clients[0]?.id || "");
  const [account, setAccount] = useState("");
  const [mode, setMode] = useState("exclusive");
  const [stage, setStage] = useState<Stage>("ATR");
  const [copied, setCopied] = useState("");
  const code = data.clients.find((c) => c.id === client)?.code;
  const prefix = code ? `[${code}][${stage}]` : "";
  const rangeFits = daysBetween(range.from, range.to) < 31;
  return (
    <>
      <Card title="Vincular conta de anúncios">
        {!data.metaConfigured ? (
          <p>
            Configure a credencial Meta no servidor para consultar as contas. Os
            relatórios já importados continuam disponíveis.
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (discover) void inventory.mutate();
                else setDiscover(true);
              }}
            >
              Buscar contas na Meta
            </Button>
            {inventory.isLoading && <p role="status">Consultando contas…</p>}
            {inventory.error && <p role="alert">{inventory.error.message}</p>}
            {inventory.data?.length === 0 && (
              <p>A credencial não retornou contas de anúncios.</p>
            )}
            {!!inventory.data?.length && (
              <form
                className="paid-filter"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    {
                      action: "link",
                      clientId: client,
                      accountId: account,
                      mode,
                    },
                    "Vínculo salvo.",
                  );
                }}
              >
                <label>
                  Cliente
                  <select
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                  >
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Conta
                  <select
                    required
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {inventory.data.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.id} · {a.currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Uso da conta
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="exclusive">Exclusiva do cliente</option>
                    <option value="shared">Compartilhada da agência</option>
                  </select>
                </label>
                <Button type="submit" disabled={pending || !client || !account}>
                  Vincular conta
                </Button>
              </form>
            )}
          </>
        )}
        {code && (
          <div className="paid-filter">
            <label>
              Cliente para o código
              <select
                value={client}
                onChange={(e) => setClient(e.target.value)}
              >
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etapa
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prefixo da campanha
              <input
                value={prefix}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prefix);
                  setCopied("Prefixo copiado.");
                } catch {
                  setCopied(prefix);
                }
              }}
            >
              Copiar prefixo
            </Button>
          </div>
        )}
        {copied && <p role="status">{copied}</p>}
      </Card>
      <Card title="Contas cadastradas">
        {!rangeFits && (
          <p>Para sincronizar, selecione um período de até 31 dias.</p>
        )}
        {!data.accounts.length && <p>Nenhuma conta vinculada.</p>}
        {data.accounts.map((a) => (
          <div key={a.account_id} className="paid-row">
            <div>
              <strong>{a.name}</strong> ·{" "}
              <Badge>{a.shared ? "Compartilhada" : "Exclusiva"}</Badge>
              <p className="muted">
                {a.account_id} · {a.currency} · {a.timezone}
              </p>
              {a.clientIds.map((id) => (
                <span key={id} className="paid-link">
                  {data.clients.find((c) => c.id === id)?.name}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remover o vínculo com este cliente? Campanhas atribuídas voltarão à revisão.",
                        )
                      )
                        void run(
                          {
                            action: "link",
                            clientId: id,
                            accountId: a.account_id,
                            mode: "remove",
                          },
                          "Vínculo removido.",
                        );
                    }}
                  >
                    Remover vínculo
                  </Button>
                </span>
              ))}
            </div>
            <Button
              size="sm"
              disabled={
                pending ||
                !rangeFits ||
                !a.clientIds.length ||
                !data.metaConfigured
              }
              onClick={() =>
                run(
                  { action: "sync", accountId: a.account_id, ...range },
                  "Sincronização concluída.",
                )
              }
            >
              Sincronizar período
            </Button>
          </div>
        ))}
      </Card>
    </>
  );
}
type RuleData = {
  connections: { id: string; name: string; instance_name: string }[];
  rules: {
    id: string;
    connection_id: string;
    campaign_id: string;
    phrase: string;
  }[];
};
function WhatsAppRules({
  data,
  filter,
  run,
  pending,
}: {
  data: MediaReport;
  filter: string;
  run: Run;
  pending: boolean;
}) {
  const [client, setClient] = useState(filter || data.clients[0]?.id || "");
  const [connection, setConnection] = useState("");
  const [campaign, setCampaign] = useState("");
  const [phrase, setPhrase] = useState("");
  const {
    data: rules,
    error,
    mutate,
    isLoading,
  } = useSWR<RuleData>(
    client ? `${endpoint}?kind=phrases&clientId=${client}` : null,
    requestMedia,
    { revalidateOnFocus: false },
  );
  const campaigns = data.campaigns.filter((c) => c.client_id === client);
  return (
    <Card title="Mensagem inicial do WhatsApp">
      <label>
        Cliente
        <select
          value={client}
          onChange={(e) => {
            setClient(e.target.value);
            setConnection("");
            setCampaign("");
          }}
        >
          {data.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Cadastre uma frase exclusiva por campanha e linha. O Atend&Hub compara
        somente a primeira mensagem recebida da oportunidade.
      </p>
      {error && <p role="alert">{error.message}</p>}
      {isLoading && <p role="status">Carregando regras…</p>}
      {rules && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await run(
                {
                  action: "phrase",
                  clientId: client,
                  connectionId: connection,
                  campaignId: campaign,
                  phrase,
                },
                "Regra salva.",
              );
              await mutate();
            }}
            className="paid-filter"
          >
            <label>
              Conexão
              <select
                required
                value={connection}
                onChange={(e) => setConnection(e.target.value)}
              >
                <option value="">Selecione</option>
                {rules.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Campanha
              <select
                required
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              >
                <option value="">Selecione</option>
                {campaigns.map((c) => (
                  <option key={c.campaign_id} value={c.campaign_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mensagem inicial
              <input
                required
                minLength={5}
                maxLength={300}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            <Button
              disabled={pending || !campaign || !connection}
              type="submit"
            >
              Salvar regra
            </Button>
          </form>
          {rules.rules.map((r) => (
            <div className="paid-row" key={r.id}>
              <div>
                <strong>{r.phrase}</strong>
                <p>
                  {
                    rules.connections.find((c) => c.id === r.connection_id)
                      ?.name
                  }{" "}
                  ·{" "}
                  {campaigns.find((c) => c.campaign_id === r.campaign_id)
                    ?.name ?? r.campaign_id}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={async () => {
                  await run(
                    { action: "removePhrase", clientId: client, ruleId: r.id },
                    "Regra removida.",
                  );
                  await mutate();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
