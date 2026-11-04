"use client";
import { useState } from "react";
import {
  Users,
  Clock3,
  CalendarCheck,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Empty,
  LoadingState,
  stageLabels,
} from "@/components/layout/shared";
import { LeadTable } from "@/features/leads/components/lead-table";
import { Button } from "@/components/ui/button";
export function Dashboard() {
  const { repositories, clientId } = useDemo();
  const [period, setPeriod] = useState("month"),
    [stage, setStage] = useState("all"),
    [state, setState] = useState("ready");
  const client = repositories.clients.get(clientId);
  const leads = repositories.leads
    .list(clientId)
    .filter(
      (l) =>
        (period !== "today" || l.createdAt.startsWith("2026-11-03")) &&
        (stage === "all" || l.stage === stage),
    );
  const scheduled = leads.filter((l) =>
    ["scheduled", "confirmed"].includes(l.stage),
  ).length;
  const metrics = [
    ["Leads recebidos", leads.length, "Contatos no período", Users],
    [
      "Aguardando atendimento",
      leads.filter((l) => l.stage === "new").length,
      "leads sem primeiro atendimento",
      Clock3,
    ],
    ["Agendamentos registrados", scheduled, "Leads agendados", CalendarCheck],
    [
      "Lead → agendamento",
      leads.length ? `${Math.round((scheduled / leads.length) * 100)}%` : "N/D",
      `${scheduled} agendados / ${leads.length} leads`,
      ArrowUpRight,
    ],
  ] as const;
  return (
    <>
      <Heading
        title="Visão geral"
        description={`${client.name} · acompanhe sua operação em um só lugar.`}
        action={
          <NavButton href="/app/fila">Abrir fila de atendimento</NavButton>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <Button
            variant={period === "today" ? "default" : "ghost"}
            onClick={() => setPeriod("today")}
          >
            Hoje
          </Button>
          <Button
            variant={period === "month" ? "default" : "ghost"}
            onClick={() => setPeriod("month")}
          >
            Últimos 30 dias
          </Button>
        </div>
        <label>
          Estágio{" "}
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(stageLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="push-right">
          Testar estado{" "}
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="ready">Dados</option>
            <option value="loading">Carregando</option>
            <option value="empty">Vazio</option>
            <option value="error">Erro</option>
          </select>
        </label>
      </div>
      {state === "loading" ? (
        <LoadingState label="Carregando indicadores…" />
      ) : state === "empty" ? (
        <Empty />
      ) : state === "error" ? (
        <Card>
          <p role="alert">Falha ao carregar indicadores.</p>
          <Button onClick={() => setState("ready")}>Tentar novamente</Button>
        </Card>
      ) : (
        <>
          <div className="metrics">
            {metrics.map(([label, value, context, Icon]) => (
              <Card key={label}>
                <div className="metric-top">
                  <span>{label}</span>
                  <Icon size={19} />
                </div>
                <strong className="metric-value">{value}</strong>
                <small>{context}</small>
                <span className="metric-foot">
                  Período ·{" "}
                  {period === "today" ? "03/11/2026" : "05/10–03/11/2026"}
                </span>
              </Card>
            ))}
          </div>
          <div className="dashboard-bento">
            <Card title="Da intenção ao agendamento" className="bento-funnel">
              <div className="section-caption">Funil operacional</div>
              {[
                ["Leads recebidos", leads.length],
                ["Em atendimento", leads.filter((l) => l.owner).length],
                ["Agendados", scheduled],
              ].map(([label, count], i) => (
                <div className="funnel-row" data-series={i % 5} key={label}>
                  <div>
                    <span>
                      0{i + 1} · {label}
                    </span>
                    <strong>
                      {count} / {leads.length}
                    </strong>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${leads.length ? (Number(count) / leads.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <small>
                Denominador: leads do recorte selecionado. Sem dados de receita
                ou disponibilidade.
              </small>
            </Card>
            <Card title="Prioridade de atendimento" className="bento-priority">
              <div className="priority-value">
                <Clock3 size={20} />
                <strong>{leads.filter((l) => !l.owner).length}</strong>
                <span>leads sem responsável</span>
              </div>
              <NavButton href="/app/fila">Acessar fila</NavButton>
            </Card>
            <Card className="attention-card bento-attention">
              <div className="section-caption">
                <h2>Precisa de atenção</h2>
                <AlertCircle size={20} />
              </div>
              <Badge tone="warning">Conexão não configurada</Badge>
              <p>Consulte o histórico na central de mensagens.</p>
              <NavButton href="/app/inbox">Explorar Inbox</NavButton>
            </Card>
          </div>
          <Card>
            <div className="section-caption">
              <div>
                <h2>Oportunidades em movimento</h2>
                <p className="muted">
                  Cada contato com contexto e próximo passo.
                </p>
              </div>
              <NavButton href="/app/leads">Ver todos os leads</NavButton>
            </div>
            <LeadTable leads={leads} />
          </Card>
        </>
      )}
    </>
  );
}
