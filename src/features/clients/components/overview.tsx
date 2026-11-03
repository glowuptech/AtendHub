"use client";
import { useState } from "react";
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
import { useDemo } from "@/components/layout/demo-context";
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
 DEMO_TODAY,
  shiftDay,
  partnershipSummary,
  ratio,
  RangeSchema,
  getClientOverview,
} from "../services/overview";
export const dateLabel = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "Não informado";
export function Partnership({
  client,
  onEdit,
}: {
  client: Client;
  onEdit: () => void;
}) {
  const p = client.partnership,
    s = partnershipSummary(p);
  return (
    <Card className="partnership-card">
      <div className="section-caption">
        <div>
          <p className="eyebrow">RELACIONAMENTO COM A PRESCRITA</p>
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
          Responsável: {p.manager || "Não informado"} · Referência fixa:{" "}
          {dateLabel(DEMO_TODAY)}. Contrato não acompanha o filtro de métricas.
        </small>
      </div>
    </Card>
  );
}
export function ClientOverview({
  client,
  onEdit,
}: {
  client: Client;
  onEdit: () => void;
}) {
  const { repositories } = useDemo();
  const [range, setRange] = useState({
      from: shiftDay(DEMO_TODAY, -29),
      to:DEMO_TODAY,
    }),
    [draftRange, setDraftRange] = useState(range),
    [doctor, setDoctor] = useState("all"),
    [error, setError] = useState("");
  const data = getClientOverview(repositories, client.id, range, doctor);
  const known = data.appointments.filter(
      (a) => a.attendance !== "unknown",
    ).length,
    present = data.appointments.filter(
      (a) => a.attendance === "present",
    ).length;
  const max = Math.max(
    1,
    ...data.daily.map((d) => Math.max(d.leads, d.appointments)),
  );
  const metrics = [
    {
      title: "Leads recebidos",
      value: String(data.leads.length),
      detail: "Criados no período selecionado",
      icon: Users,
    },
    {
      title: "Conversão em agendamento",
      value: ratio(data.converted, data.leads.length),
      detail: `${data.converted} leads com espelho / ${data.leads.length} recebidos`,
      icon: TrendingUp,
    },
    {
      title: "Conversão dos formulários",
      value: ratio(data.submitted, data.views),
      detail: `${data.submitted} envios / ${data.views} sessões `,
      icon: ClipboardCheck,
    },
    {
      title: "Agendamentos no período",
      value: String(data.appointments.length),
      detail: "Data da consulta no período · espelhos",
      icon: CalendarDays,
    },
    {
      title: "Primeira resposta humana",
      value:
        data.responseAverage === null
          ? "N/D"
          : `${data.responseAverage.toFixed(1).replace(".", ",")} min`,
      detail: `Média corrida · ${data.responded}/${data.leads.length} leads com registro`,
      icon: Clock3,
    },
    {
      title: "Tempo de atendimento",
      value:
        data.handlingAverage === null
          ? "N/D"
          : `${data.handlingAverage.toFixed(1).replace(".", ",")} min`,
      detail: `Média de duração registrada · ${data.handlingCount} amostras`,
      icon: Timer,
    },
  ];
  return (
    <>
      <Partnership client={client} onEdit={onEdit} />
      <div className="section-caption">
        <div>
          <h2>Desempenho da clínica</h2>
          <p className="muted">
            Aquisição, atendimento e agendamento no mesmo recorte.
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
          setRange(parsed.data);
        }}
      >
        <div className="actions">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              type="button"
              variant={
                range.from === shiftDay(DEMO_TODAY, 1 - days) &&
                range.to ===DEMO_TODAY
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                const next = {
                  from: shiftDay(DEMO_TODAY, 1 - days),
                  to:DEMO_TODAY,
                };
                setRange(next);
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
              <option value="all">Todos da clínica</option>
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
          America/Sao_Paulo · Período internas. Presets relativos a{" "}
          {dateLabel(DEMO_TODAY)}.
        </small>
      </form>
      <div className="client-metrics">
        {metrics.map((m) => (
          <Card key={m.title}>
            <div className="metric-top">
              <span>{m.title}</span>
              <m.icon size={18} />
            </div>
            <strong className="metric-value">{m.value}</strong>
            <small>{m.detail}</small>
          </Card>
        ))}
      </div>
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
          {!data.leads.length && !data.appointments.length ? (
            <Empty
              title="Sem movimento neste período"
              description="Ajuste as datas ou o profissional para explorar os exemplos."
            />
          ) : (
            <div
              className="daily-chart"
              tabIndex={0}
              role="img"
              aria-label={`Evolução diária: ${data.leads.length} leads recebidos e ${data.appointments.length} agendamentos no período. Detalhes por data na tabela abaixo.`}
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
            ["Leads recebidos", data.leads.length],
            ["Com resposta humana", data.responded],
            ["Com agendamento espelhado", data.converted],
          ].map(([label, n], i) => (
            <div className="funnel-row" data-series={i} key={label}>
              <div>
                <span>{label}</span>
                <strong>
                  {n}/{data.leads.length}
                </strong>
              </div>
              <div className="bar-track">
                <span
                  style={{
                    width: `${data.leads.length ? (Number(n) / data.leads.length) * 100 : 0}%`,
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
              Cobertura: {known}/{data.appointments.length} consultas do
              período. Ausência de informação não conta como falta.
            </small>
          </div>
        </Card>
      </div>
      <Card title="Conversão por formulário">
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
                <th>Conversão</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody>
              {data.forms.map((f) => (
                <tr key={f.id}>
                  <td>
                    <NavButton
                      href={`/app/clientes/${client.id}/formularios/${f.id}/analytics`}
                    >
                      {f.name}
                    </NavButton>
                  </td>
                  <td>{f.views}</td>
                  <td>{f.submitted}</td>
                  <td>{ratio(f.submitted, f.views)}</td>
                  <td>{f.version}</td>
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
              <strong>
                {data.leads.filter((l) => l.stage === key).length}
              </strong>
            </div>
          ))}
          <NavButton href="/app/leads">Abrir CRM da clínica</NavButton>
        </Card>
        <Card title="Próximos passos e agendamentos">
          {data.leads
            .filter((l) => !l.firstResponseAt)
            .map((l) => (
              <div className="profile-stat-row" key={l.id}>
                <span>
                  {l.name}
                  <small>Primeira resposta humana não registrada</small>
                </span>
                <NavButton href={`/app/leads/${l.id}`}>Atender</NavButton>
              </div>
            ))}
          {data.appointments.map((a) => (
            <div className="profile-stat-row" key={a.id}>
              <span>
                {a.name}
                <small>{dateTime(a.scheduledAt)} · espelho</small>
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
          {!data.appointments.length &&
            !data.leads.some((l) => !l.firstResponseAt) && (
              <p className="muted">
                Nenhuma pendência neste recorte.
              </p>
            )}
          <NavButton href="/app/agendamentos">Ver agendamentos</NavButton>
        </Card>
      </div>
      <p className="muted profile-metric-note">
        Tempo até a primeira resposta é corrido, não SLA em horário útil. Tempo
        de atendimento usa duração registrada, não tempo desde o último contato.
        Médicos são filtrados por vínculo explícito do lead/formulário; dados
        sem vínculo ficam em “Sem profissional vinculado”.
      </p>
    </>
  );
}
