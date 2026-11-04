"use client";
import { useState } from "react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  stageLabels,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { systemOverview } from "./service";
import {
  localDay,
  shiftDay,
  RangeSchema,
} from "@/features/clients/services/overview";
const money = (c: number | null) =>
  c === null
    ? "Não disponível"
    : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) =>
  v === null
    ? "—"
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const dayLabel = (v: string) => v.split("-").reverse().join("/");
export function SystemDashboard() {
  const { repositories, scope, refresh } = useDemo();
  const [today] = useState(() => localDay(new Date().toISOString()));
  const [range, setRange] = useState({ from: shiftDay(today, -29), to: today }),
    [draft, setDraft] = useState(range),
    [vertical, setVertical] = useState("all"),
    [clientFilter, setClientFilter] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [entryClient, setEntryClient] = useState(""),
    [entryDay, setEntryDay] = useState(today),
    [amount, setAmount] = useState(""),
    [notes, setNotes] = useState("");
  const clients = repositories.clients.list(scope);
  const data = systemOverview(
      repositories,
      scope,
      range,
      vertical,
      clientFilter,
    ),
    total = data.total;
  const previous = systemOverview(
    repositories,
    scope,
    {
      from: shiftDay(range.from, -data.dates.length),
      to: shiftDay(range.from, -1),
    },
    vertical,
    clientFilter,
  ).total;
  const entries = data.rows
    .flatMap((r) => r.investment.map((i) => ({ ...i, client: r.client.name })))
    .sort(
      (a, b) => b.day.localeCompare(a.day) || a.client.localeCompare(b.client),
    );
  const eligible = clients.filter(
    (c) => vertical === "all" || c.vertical === vertical,
  );
  function exportReport() {
    const cells = (values: unknown[]) =>
      values
        .map((v) => {
          let text = String(v ?? "");
          if (/^[=+@-]/.test(text)) text = "'" + text;
          return '"' + text.replaceAll('"', '""') + '"';
        })
        .join(";");
    const lines = [
      cells([
        "Cliente",
        "Frente",
        "Leads",
        "Convertidos",
        "Investimento informado BRL",
        "Dias informados",
        "Dias esperados",
        "CPL BRL",
      ]),
      ...data.rows.map((r) =>
        cells([
          r.client.name,
          r.client.vertical === "healthcare" ? "Prescrita" : "Veredite",
          r.leads.length,
          r.converted,
          r.coverage ? (r.spent / 100).toFixed(2) : "",
          r.coverage,
          data.dates.length,
          r.cpl === null ? "" : (r.cpl / 100).toFixed(2),
        ]),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `atend-hub-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="system-dashboard">
      <Heading
        eyebrow="SISTEMA / DESEMPENHO"
        title="Dashboard geral"
        description="Clientes, aquisição e operação em uma visão compartilhada"
        action={
          <Button variant="outline" onClick={exportReport}>
            Exportar relatório
          </Button>
        }
      />
      <form
        className="system-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const result = RangeSchema.safeParse(draft);
          if (!result.success) {
            setError(result.error.issues[0].message);
            return;
          }
          setRange(result.data);
          setError("");
        }}
      >
        <div className="actions">
          {[7, 30, 90].map((days) => (
            <Button
              type="button"
              variant={
                range.from === shiftDay(today, 1 - days) && range.to === today
                  ? "default"
                  : "outline"
              }
              key={days}
              onClick={() => {
                const next = { from: shiftDay(today, 1 - days), to: today };
                setRange(next);
                setDraft(next);
                setError("");
              }}
            >
              Últimos {days} dias
            </Button>
          ))}
        </div>
        <div className="system-filter-fields">
          <label>
            De
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <label>
            Frente
            <select
              value={vertical}
              onChange={(e) => {
                setVertical(e.target.value);
                setClientFilter("");
              }}
            >
              <option value="all">Todas as frentes</option>
              <option value="healthcare">Prescrita · Saúde</option>
              <option value="legal">Veredite · Jurídico</option>
            </select>
          </label>
          <label>
            Cliente
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">Todos os clientes</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Aplicar período</Button>
        </div>
        <small>
          Período aplicado: {dayLabel(range.from)} a {dayLabel(range.to)} ·
          America/Sao_Paulo
        </small>
        {error && <p role="alert">{error}</p>}
      </form>
      <div className="system-kpis">
        {[
          [
            "Clientes cadastrados",
            total.clients,
            `${total.active} ativos · ${total.clients - total.active} pausados`,
          ],
          [
            "Leads recebidos",
            total.leads,
            `${total.completed} concluídos · ${total.incomplete} parciais`,
          ],
          [
            "Investimento informado",
            money(total.coverage ? total.spent : null),
            `${total.coverage} de ${total.expected} dias/cliente informados`,
          ],
          [
            "Custo por lead geral",
            money(total.cpl),
            "Investimento ÷ todos os leads do período",
          ],
          [
            "Conversão em agendamento",
            pct(total.conversion),
            `${total.converted} leads com agendamento / ${total.leads} recebidos`,
          ],
          [
            "Custo por lead convertido",
            money(total.cpa),
            "Investimento ÷ leads com agendamento",
          ],
        ].map(([title, value, detail]) => (
          <Card key={title} title={String(title)}>
            <strong className="system-value">{value}</strong>
            <small>{detail}</small>
          </Card>
        ))}
      </div>
      <div className="vertical-comparison">
        {(["healthcare", "legal"] as const).map((v) => {
          const s = data[v];
          return (
            <section className={`vertical-card ${v}`} key={v}>
              <header>
                <div>
                  <small>{v === "healthcare" ? "SAÚDE" : "JURÍDICO"}</small>
                  <h2>{v === "healthcare" ? "Prescrita" : "Veredite"}</h2>
                </div>
                <Badge>{s.clients} clientes</Badge>
              </header>
              <div className="vertical-stats">
                <div>
                  <span>Leads</span>
                  <strong>{s.leads}</strong>
                </div>
                <div>
                  <span>Investimento</span>
                  <strong>{money(s.coverage ? s.spent : null)}</strong>
                </div>
                <div>
                  <span>CPL geral</span>
                  <strong>{money(s.cpl)}</strong>
                </div>
                <div>
                  <span>Conversão</span>
                  <strong>{pct(s.conversion)}</strong>
                </div>
              </div>
              <p>
                {v === "healthcare"
                  ? "Clínicas e contas médicas"
                  : "Escritórios e contas de advocacia"}{" "}
                · {s.active} ativos
              </p>
              {!s.clients ? (
                <small>Nenhum cliente desta frente no recorte.</small>
              ) : !s.complete ? (
                <small>Complete os investimentos para calcular custos.</small>
              ) : (
                <small>Investimento completo para o recorte.</small>
              )}
            </section>
          );
        })}
      </div>
      <section className="system-section">
        <div className="section-caption">
          <div>
            <h2>Investimento e entrada de leads</h2>
            <p>Séries diárias por frente, com escalas independentes</p>
          </div>
          <div className="series-legend">
            <span className="healthcare">● Prescrita</span>
            <span className="legal">● Veredite</span>
          </div>
        </div>
        <div className="system-charts">
          {["spent", "leads"].map((metric) => {
            const max = Math.max(
              1,
              ...data.daily.flatMap((d) => [
                d.healthcare[metric as "spent" | "leads"],
                d.legal[metric as "spent" | "leads"],
              ]),
            );
            return (
              <Card
                key={metric}
                title={
                  metric === "spent"
                    ? "Investimento diário (R$)"
                    : "Leads recebidos por dia"
                }
              >
                <div
                  className="daily-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={
                    metric === "spent"
                      ? "Gráfico de investimento diário"
                      : "Gráfico de leads diários"
                  }
                >
                  <div className="daily-bars">
                    {data.daily.map((d) => (
                      <div className="daily-day" key={d.day}>
                        <div className="daily-pair">
                          {(["healthcare", "legal"] as const).map((v) => {
                            const s = d[v],
                              unknown = metric === "spent" && !s.coverage;
                            return (
                              <div
                                key={v}
                                className={`daily-bar ${v} ${unknown ? "unknown" : ""}`}
                                style={{
                                  height: unknown
                                    ? "3px"
                                    : `${Math.max(2, (s[metric as "spent" | "leads"] / max) * 130)}px`,
                                }}
                                title={`${dayLabel(d.day)} · ${v === "healthcare" ? "Prescrita" : "Veredite"} · ${metric === "spent" ? (unknown ? "Investimento não informado" : money(s.spent)) : `${s.leads} leads`}`}
                              />
                            );
                          })}
                        </div>
                        <small>{d.day.slice(8)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <details>
          <summary>Consultar os valores por dia</summary>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Dados diários"
          >
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Prescrita · gasto</th>
                  <th>Prescrita · leads</th>
                  <th>Veredite · gasto</th>
                  <th>Veredite · leads</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td>{dayLabel(d.day)}</td>
                    {(["healthcare", "legal"] as const).map((v) => (
                      <FragmentCells
                        key={v}
                        spend={d[v].spent}
                        leads={d[v].leads}
                        coverage={d[v].coverage}
                        expected={d[v].expected}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <small>
          Gastos sem lançamento ficam sem valor. Leads são todos os recebidos,
          sem atribuição comprovada ao tráfego pago. CPL exibido é geral, não o
          CPL exclusivo dos anúncios.
        </small>
      </section>
      <div className="system-two-columns">
        <Card title="Operação e qualidade">
          <div className="operational-stats">
            {[
              ["Aguardando responsável", total.unassigned],
              ["Claims após o prazo", total.lateClaims],
              [
                "Primeira resposta média",
                total.response === null
                  ? "—"
                  : `${total.response.toFixed(1)} min`,
              ],
              [
                "Amostras de resposta",
                `${total.responseSamples} / ${total.leads}`,
              ],
              ["Agendamentos no período", total.appointments],
              ["Presenças informadas", total.present],
              ["Faltas informadas", total.absent],
              ["Presenças pendentes", total.pendingPresence],
              ["Formulários cadastrados", total.forms],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <small>
            Agendamentos pela data da consulta; primeira resposta em tempo
            corrido. Claims usam o prazo útil registrado ao assumir.
          </small>
        </Card>
        <Card title="Leads por estágio">
          {Object.entries(stageLabels).map(([stage, label]) => (
            <div className="system-stage-row" key={stage}>
              <span>{label}</span>
              <strong>{data.stages[stage] || 0}</strong>
              <div className="system-stage-track">
                <span
                  data-stage={stage}
                  style={{
                    width: `${total.leads ? ((data.stages[stage] || 0) / total.leads) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <Card title="Comparação com o período anterior">
        <p>
          {dayLabel(shiftDay(range.from, -data.dates.length))} a{" "}
          {dayLabel(shiftDay(range.from, -1))}
        </p>
        <div className="operational-stats">
          {[
            ["Leads", total.leads, previous.leads],
            ["Leads convertidos", total.converted, previous.converted],
            [
              "Investimento informado",
              money(total.coverage ? total.spent : null),
              money(previous.coverage ? previous.spent : null),
            ],
            ["CPL geral", money(total.cpl), money(previous.cpl)],
            ["Conversão", pct(total.conversion), pct(previous.conversion)],
          ].map(([label, current, before]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{current}</strong>
              <small>Anterior: {before}</small>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Desempenho por cliente">
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Comparativo por cliente"
        >
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Frente</th>
                <th>Leads</th>
                <th>Investimento</th>
                <th>Cobertura</th>
                <th>CPL geral</th>
                <th>Conversão</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.client.id}>
                  <td>{row.client.name}</td>
                  <td>
                    <span className={row.client.vertical}>
                      {row.client.vertical === "healthcare"
                        ? "Prescrita"
                        : "Veredite"}
                    </span>
                  </td>
                  <td>{row.leads.length}</td>
                  <td>{money(row.coverage ? row.spent : null)}</td>
                  <td>
                    {row.coverage}/{data.dates.length} dias
                  </td>
                  <td>{money(row.cpl)}</td>
                  <td>
                    {pct(
                      row.leads.length
                        ? (row.converted / row.leads.length) * 100
                        : null,
                    )}
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setVertical(row.client.vertical);
                        setClientFilter(row.client.id);
                      }}
                    >
                      Filtrar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && <p>Nenhum cliente neste filtro.</p>}
      </Card>
      <details className="system-investments">
        <summary>Gerenciar investimentos de tráfego pago</summary>
        <p>
          Um lançamento consolidado por cliente e dia. Salvar a mesma data
          substitui o valor anterior; zero significa gasto conferido e igual a
          zero.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount))
                throw Error(
                  "Informe um valor positivo ou zero com até duas casas decimais.",
                );
              const [whole, decimal = ""] = amount.replace(",", ".").split(".");
              repositories.investments.save({
                clientId: entryClient,
                day: entryDay,
                amountCents:
                  Number(whole) * 100 + Number(decimal.padEnd(2, "0")),
                notes,
              });
              refresh();
              setMessage("Investimento salvo.");
            } catch (err) {
              setMessage(
                err instanceof Error ? err.message : "Confira os campos",
              );
            }
          }}
        >
          <div className="system-filter-fields">
            <label>
              Cliente do investimento
              <select
                required
                value={entryClient}
                onChange={(e) => setEntryClient(e.target.value)}
              >
                <option value="">Selecione</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data do investimento
              <input
                required
                type="date"
                value={entryDay}
                onChange={(e) => setEntryDay(e.target.value)}
              />
            </label>
            <label>
              Valor investido (R$)
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Observação / fonte
              <input
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <Button type="submit">Salvar investimento</Button>
          </div>
        </form>
        <p role="status">{message}</p>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Lançamentos de investimento"
        >
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Fonte / observação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((i) => (
                <tr key={`${i.clientId}-${i.day}`}>
                  <td>{dayLabel(i.day)}</td>
                  <td>{i.client}</td>
                  <td>{money(i.amountCents)}</td>
                  <td>{i.notes || "Manual"}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEntryClient(i.clientId);
                        setEntryDay(i.day);
                        setAmount((i.amountCents / 100).toFixed(2));
                        setNotes(i.notes);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        repositories.investments.remove(i.clientId, i.day);
                        refresh();
                        setMessage(
                          "Lançamento removido. O dia voltou a ficar sem informação.",
                        );
                      }}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && <p>Nenhum investimento lançado no recorte.</p>}
      </details>
      <div className="system-notes">
        <p>
          Clientes e formulários mostram a base atual; leads e investimentos
          seguem o período. Conversão conta uma vez cada lead do período que
          possui agendamento registrado, mesmo que a consulta seja futura.
        </p>
        <p>
          {total.expected - total.coverage} dias/cliente sem investimento
          informado. Integração com plataformas de anúncios e atribuição de
          origem serão conectadas depois.
        </p>
        <NavButton href="/app/fila">Abrir fila de atendimento</NavButton>
      </div>
    </div>
  );
}
function FragmentCells({
  spend,
  leads,
  coverage,
  expected,
}: {
  spend: number;
  leads: number;
  coverage: number;
  expected: number;
}) {
  return (
    <>
      <td>
        {coverage ? money(spend) : "—"}
        {expected > 0 && coverage < expected && (
          <small>
            Parcial: {coverage}/{expected} clientes
          </small>
        )}
      </td>
      <td>{leads}</td>
    </>
  );
}
