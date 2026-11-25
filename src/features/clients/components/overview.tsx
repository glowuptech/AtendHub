"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  CalendarDays,
  Clock3,
  FileSignature,
  Users,
  TrendingUp,
  Timer,
  ClipboardCheck,
} from "lucide-react";
import type { Client } from "@/domain/schemas";
import {
  Card,
  Badge,
  NavButton,
  Empty,
  stageLabels,
  dateTime,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import {
  shiftDay,
  partnershipSummary,
  ratio,
  RangeSchema,
  type ClientOverviewData,
  type OverviewRange,
} from "../services/overview";
import { ClientMediaSpend } from "./client-media-spend";

export const dateLabel = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "Não informado";
export function Partnership({
  client,
  onEdit,
  today,
}: {
  client: Client;
  onEdit: () => void;
  today: string;
}) {
  const p = client.partnership,
    s = partnershipSummary(p, today);
  return (
    <Card className="partnership-card">
      <div className="section-caption">
        <div>
          <p className="eyebrow">PARCERIA</p>
          <h2>Parceria e contrato</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Editar informações
        </Button>
      </div>
      <div className="partnership-grid">
        <div>
          <Clock3 size={18} />
          <small>Tempo de parceria</small>
          <strong>
            {s.projectDays === null
              ? "Não informado"
              : s.projectDays < 0
                ? `Inicia em ${-s.projectDays} dias`
                : `${s.projectDays} dias`}
          </strong>
          <small>Início do projeto: {dateLabel(p.projectStartedOn)}</small>
        </div>
        <div>
          <FileSignature size={18} />
          <small>Assinatura do contrato</small>
          <strong>
            {p.signedOn
              ? s.contractDays! < 0
                ? "Data futura informada"
                : "Assinado"
              : "Pendente de assinatura"}
          </strong>
          <small>
            {p.signedOn
              ? `${dateLabel(p.signedOn)} · ${s.contractDays! >= 0 ? `${s.contractDays} dias desde a assinatura` : `em ${-s.contractDays!} dias`}`
              : p.signatureDueOn
                ? `Prazo: ${dateLabel(p.signatureDueOn)}`
                : "Prazo de assinatura não informado"}
          </small>
        </div>
        <div>
          <CalendarDays size={18} />
          <small>Próxima renovação</small>
          <strong>
            {s.renewalDays === null
              ? "Não informada"
              : s.renewalDays < 0
                ? `Vencida há ${-s.renewalDays} dias`
                : s.renewalDays === 0
                  ? "Renova hoje"
                  : `Em ${s.renewalDays} dias`}
          </strong>
          <small>{dateLabel(p.renewsOn)} · sem renovação automática</small>
        </div>
      </div>
      <div className="partnership-alerts">
        {s.signatureDays !== null && (
          <Badge tone={s.signatureDays < 0 ? "error" : "warning"}>
            {s.signatureDays < 0
              ? `Assinatura atrasada há ${-s.signatureDays} dias`
              : s.signatureDays === 0
                ? "Prazo de assinatura vence hoje"
                : `Faltam ${s.signatureDays} dias para o prazo de assinatura`}
          </Badge>
        )}
        {s.renewalDays !== null && s.renewalDays <= 30 && (
          <Badge tone={s.renewalDays < 0 ? "error" : "warning"}>
            {s.renewalDays < 0
              ? "Revisar renovação vencida"
              : "Revisar renovação nos próximos 30 dias"}
          </Badge>
        )}
        <small>
          Responsável: {p.manager || "Não informado"} · Prazos em{" "}
          {dateLabel(today)}
        </small>
      </div>
    </Card>
  );
}
async function requestOverview(url: string): Promise<ClientOverviewData> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new Error(
      body?.error ?? "Não foi possível carregar os indicadores deste cliente.",
    );
  return body;
}

export function ClientOverview({
  client,
  today,
  range,
  onPeriodChange,
  onPaidMedia,
  onEdit,
}: {
  client: Client;
  today: string;
  range: OverviewRange;
  onPeriodChange: (range: OverviewRange) => void;
  onPaidMedia: () => void;
  onEdit: () => void;
}) {
  const [draftRange, setDraftRange] = useState(range);
  const [doctor, setDoctor] = useState("all");
  const [error, setError] = useState("");
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR(
    `/api/clients/${client.id}/overview?${new URLSearchParams({ ...range, professional: doctor })}`,
    requestOverview,
    { revalidateOnFocus: false },
  );
  return (
    <>
      <div className="section-caption">
        <div>
          <h2>Desempenho do cliente</h2>
          <p className="muted">
            Aquisição, atendimento e agendamentos no período selecionado.
          </p>
        </div>
      </div>
      <form
        className="profile-period"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = RangeSchema.safeParse(draftRange);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setError("");
          onPeriodChange(parsed.data);
        }}
      >
        <div className="actions">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              type="button"
              variant={
                range.from === shiftDay(today, 1 - days) && range.to === today
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                const next = {
                  from: shiftDay(today, 1 - days),
                  to: today,
                };
                onPeriodChange(next);
                setDraftRange(next);
                setError("");
              }}
            >
              Últimos {days} dias
            </Button>
          ))}
        </div>
        <div className="profile-date-fields">
          <label>
            De
            <input
              type="date"
              value={draftRange.from}
              onChange={(e) =>
                setDraftRange({ ...draftRange, from: e.target.value })
              }
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={draftRange.to}
              onChange={(e) =>
                setDraftRange({ ...draftRange, to: e.target.value })
              }
            />
          </label>
          <Button type="submit" variant="outline">
            Aplicar período
          </Button>
          <label>
            Profissional
            <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
              <option value="all">Todos os profissionais</option>
              {client.doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="unassigned">Sem profissional vinculado</option>
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <small>
          Período aplicado: {dateLabel(range.from)} a {dateLabel(range.to)} ·
          America/Sao_Paulo.
        </small>
      </form>
      <div className="client-summary-bento">
        <div className="client-metrics">
          <ClientMediaSpend
            clientId={client.id}
            range={range}
            onDashboard={onPaidMedia}
          />
          {isLoading && <p role="status">Carregando indicadores do cliente…</p>}
          {loadError && (
            <Card>
              <p role="alert">{loadError.message}</p>
              <Button variant="outline" onClick={() => mutate()}>
                Tentar novamente
              </Button>
            </Card>
          )}
          {data && !loadError && <OverviewMetrics data={data} />}
        </div>
        <Partnership client={client} today={today} onEdit={onEdit} />
      </div>
      {data && !loadError && (
        <OverviewDetails clientId={client.id} data={data} />
      )}
    </>
  );
}

function OverviewMetrics({ data }: { data: ClientOverviewData }) {
  const metrics = [
    {
      title: "Leads recebidos",
      value: String(data.leadCount),
      detail: "Criados no período selecionado",
      icon: Users,
    },
    {
      title: "Conversão em agendamento",
      value: ratio(data.converted, data.leadCount),
      detail: `${data.converted} leads com agendamento / ${data.leadCount} recebidos`,
      icon: TrendingUp,
    },
    {
      title: "Envios por sessão de formulário",
      value: ratio(data.submitted, data.views ?? 0),
      detail: `${data.submitted} envios / ${data.views ?? "—"} sessões no período`,
      icon: ClipboardCheck,
    },
    {
      title: "Agendamentos no período",
      value: String(data.appointmentCount),
      detail: "Pela data marcada",
      icon: CalendarDays,
    },
    {
      title: "Primeira resposta humana",
      value:
        data.responseAverage === null
          ? "N/D"
          : `${data.responseAverage.toFixed(1).replace(".", ",")} min`,
      detail: `Média corrida · ${data.responded}/${data.leadCount} leads com registro`,
      icon: Clock3,
    },
    {
      title: "Tempo de atendimento",
      value:
        data.handlingAverage === null
          ? "N/D"
          : `${data.handlingAverage.toFixed(1).replace(".", ",")} min`,
      detail: `Abertura ao encerramento no Inbox · ${data.handlingCount} amostras`,
      icon: Timer,
    },
  ];
  return metrics.map((metric) => (
    <Card key={metric.title}>
      <div className="metric-top">
        <span>{metric.title}</span>
        <metric.icon size={18} aria-hidden="true" />
      </div>
      <strong className="metric-value">{metric.value}</strong>
      <small>{metric.detail}</small>
    </Card>
  ));
}

function OverviewDetails({
  clientId,
  data,
}: {
  clientId: string;
  data: ClientOverviewData;
}) {
  const { present, known } = data.attendance;
  const max = Math.max(
    1,
    ...data.daily.map((day) => Math.max(day.leads, day.appointments)),
  );
  return (
    <>
      <div className="profile-dashboard-grid">
        <Card title="Movimento no período">
          <div className="chart-legend">
            <span>
              <i className="series-leads" />
              Leads recebidos
            </span>
            <span>
              <i className="series-appointments" />
              Consultas marcadas para a data
            </span>
          </div>
          {!data.leadCount && !data.appointmentCount ? (
            <Empty
              title="Sem movimento neste período"
              description="Ajuste as datas ou selecione outro profissional."
            />
          ) : (
            <div
              className="daily-chart"
              tabIndex={0}
              role="img"
              aria-label={`Evolução diária: ${data.leadCount} leads recebidos e ${data.appointmentCount} agendamentos no período. Detalhes por data na tabela abaixo.`}
            >
              {data.daily.map((d) => (
                <div
                  className="daily-column"
                  key={d.day}
                  title={`${dateLabel(d.day)}: ${d.leads} leads, ${d.appointments} consultas`}
                >
                  <div className="daily-bars">
                    <span
                      className="series-leads"
                      style={{ height: `${(d.leads / max) * 100}%` }}
                    />
                    <span
                      className="series-appointments"
                      style={{ height: `${(d.appointments / max) * 100}%` }}
                    />
                  </div>
                  <small>{d.day.slice(8)}</small>
                </div>
              ))}
            </div>
          )}
          <details>
            <summary>Consultar valores por data</summary>
            <div
              className="table-scroll"
              tabIndex={0}
              aria-label="Tabela de indicadores da clínica"
            >
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Leads</th>
                    <th>Agendamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{dateLabel(d.day)}</td>
                      <td>{d.leads}</td>
                      <td>{d.appointments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <small>
            Conversão usa a coorte de leads recebidos no período, mesmo quando a
            consulta está marcada para outra data.
          </small>
        </Card>
        <Card title="Funil de atendimento">
          {[
            ["Leads recebidos", data.leadCount],
            ["Com resposta humana", data.responded],
            ["Com agendamento", data.converted],
          ].map(([label, n], i) => (
            <div className="funnel-row" data-series={i} key={label}>
              <div>
                <span>{label}</span>
                <strong>
                  {n}/{data.leadCount}
                </strong>
              </div>
              <div className="bar-track">
                <span
                  style={{
                    width: `${data.leadCount ? (Number(n) / data.leadCount) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="profile-presence">
            <strong>Comparecimento informado: {ratio(present, known)}</strong>
            <small>
              {present} presentes / {known} presenças ou faltas informadas.
            </small>
            <small>
              Cobertura: {known}/{data.appointmentCount} consultas do período.
              Ausência de informação não conta como falta.
            </small>
          </div>
        </Card>
      </div>
      <Card title="Resultados por formulário">
        <div className="actions">
          <NavButton href={`/app/clientes/${clientId}/formularios`}>
            Gerenciar formulários
          </NavButton>
          <NavButton href={`/app/clientes/${clientId}/formularios/novo`}>
            Novo formulário
          </NavButton>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Tabela de indicadores da clínica"
        >
          <table>
            <thead>
              <tr>
                <th>Formulário</th>
                <th>Sessões</th>
                <th>Envios</th>
                <th>Envios por sessão</th>
              </tr>
            </thead>
            <tbody>
              {data.forms.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{f.views ?? "—"}</td>
                  <td>{f.submitted}</td>
                  <td>{ratio(f.submitted, f.views ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.forms.length && (
          <Empty title="Nenhum formulário neste recorte" />
        )}
      </Card>
      <div className="profile-dashboard-grid">
        <Card title="Leads por estágio">
          {Object.entries(stageLabels).map(([key, label]) => (
            <div className="profile-stat-row" key={key}>
              <span>{label}</span>
              <strong>{data.stages[key] ?? 0}</strong>
            </div>
          ))}
          <NavButton href="/app/leads">Abrir CRM da clínica</NavButton>
        </Card>
        <Card title="Pendências e agendamentos">
          {data.awaitingResponse.map((l) => (
            <div className="profile-stat-row" key={l.id}>
              <span>
                {l.name}
                <small>Primeira resposta humana não registrada</small>
              </span>
              <NavButton href={`/app/leads/${l.id}`}>Atender</NavButton>
            </div>
          ))}
          {data.recentAppointments.map((a) => (
            <div className="profile-stat-row" key={a.id}>
              <span>
                {a.lead?.name ?? "Lead"}
                <small>{dateTime(a.starts_at)}</small>
              </span>
              <Badge>
                {a.attendance === "unknown"
                  ? "Presença pendente"
                  : a.attendance === "present"
                    ? "Compareceu"
                    : "Não compareceu"}
              </Badge>
            </div>
          ))}
          {!data.appointmentCount && !data.awaitingResponse.length && (
            <p className="muted">Nenhuma pendência neste recorte.</p>
          )}
          <NavButton href="/app/agendamentos">Ver agendamentos</NavButton>
        </Card>
      </div>
      <p className="muted profile-metric-note">
        O filtro de profissional usa o vínculo de cada lead, formulário ou
        agendamento. O investimento da Meta se refere ao cliente inteiro. O
        tempo de primeira resposta é corrido.
      </p>
    </>
  );
}
