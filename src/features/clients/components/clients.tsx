"use client";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { demoScope } from "@/lib/mocks/fixtures";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Empty,
  Denied,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { LeadTable } from "@/features/leads/components/lead-table";
export function Clients() {
  const { repositories, setClientId } = useDemo();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const list = repositories.clients
    .list(demoScope)
    .filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) &&
        (status === "all" || c.status === status),
    );
  return (
    <>
      <Heading
        title="Clínicas, com contexto."
        description="Duas operações fictícias. Cada clínica tem seu próprio catálogo e seus próprios dados."
      />
      <div className="toolbar">
        <label>
          Buscar clínica
          <input
            value={search}
            placeholder="Nome da clínica"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
          </select>
        </label>
      </div>
      <div className="cards-grid">
        {list.map((c) => (
          <Card key={c.id}>
            <div className="section-caption">
              <span className="large-icon">
                <Building2 />
              </span>
              <Badge tone={c.status === "active" ? "success" : "warning"}>
                {c.status === "active" ? "Ativa · DEMO" : "Pausada · DEMO"}
              </Badge>
            </div>
            <h2>{c.name}</h2>
            <p>{c.description}</p>
            <div className="mini-stats">
              <span>
                <strong>{repositories.leads.list(c.id).length}</strong> leads
                fictícios
              </span>
              <span>
                <strong>{repositories.forms.list(c.id).length}</strong>{" "}
                formulários
              </span>
            </div>
            <div onClick={() => setClientId(c.id)}>
              <NavButton href={`/app/clientes/${c.id}`}>
                Abrir clínica
              </NavButton>
            </div>
          </Card>
        ))}
      </div>
      {!list.length && <Empty />}
    </>
  );
}
export function ClientProfile({ id }: { id: string }) {
  const { repositories, clientId } = useDemo();
  const [tab, setTab] = useState("Visão geral");
  if (id !== clientId) return <Denied />;
  const c = repositories.clients.get(id);
  return (
    <>
      <Heading
        eyebrow="CLÍNICAS / PERFIL OPERACIONAL"
        title={c.name}
        description="Informações administrativas de demonstração · sem dados clínicos."
      />
      <div className="tabs" aria-label="Seções da clínica">
        {[
          "Visão geral",
          "Informações",
          "Serviços/FAQ",
          "Leads",
          "Formulários",
          "Agendamento externo",
          "Resultados",
        ].map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "ghost"}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {tab === "Leads" ? (
        <Card>
          <LeadTable leads={repositories.leads.list(id)} />
        </Card>
      ) : tab === "Formulários" ? (
        <Card title="Formulários nativos">
          <p>Campos reutilizáveis exclusivamente no catálogo desta clínica.</p>
          <NavButton href={`/app/clientes/${id}/formularios`}>
            Gerenciar formulários
          </NavButton>
        </Card>
      ) : tab === "Agendamento externo" ? (
        <Card title="A agenda oficial é externa">
          <p>
            Este link abre apenas example.com, um endereço seguro de
            demonstração. Não representa a agenda de uma médica.
          </p>
          <a
            className="button button-primary"
            href={c.externalSchedulingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir sistema de agenda · DEMO
          </a>
        </Card>
      ) : tab === "Serviços/FAQ" ? (
        <Card title="Base administrativa DEMO">
          <details>
            <summary>Como funciona o agendamento?</summary>
            <p>
              O atendente consulta o sistema externo oficial e registra um
              espelho administrativo no Prescrita.
            </p>
          </details>
          <details>
            <summary>Há valores ou convênios confirmados?</summary>
            <p>
              Não. Informações comerciais reais serão revisadas pela clínica
              antes do piloto.
            </p>
          </details>
          <small>Fonte: fixture de demonstração · revisão 03/11/2026</small>
        </Card>
      ) : tab === "Resultados" ? (
        <Card title="Resultados demonstrativos">
          <p>
            {repositories.leads.list(id).length} leads fictícios ·{" "}
            {repositories.appointments.list(id).length} registros espelhados de
            exemplo.
          </p>
          <NavButton href="/app">Ver indicadores e denominadores</NavButton>
        </Card>
      ) : (
        <div className="cards-grid">
          <Card title="Informações da clínica">
            <p>{c.description}</p>
            <p>Vertical: Saúde / Prescrita</p>
            <p>
              Operadora: GlowUp · Horário: segunda a sexta, administrativo DEMO
            </p>
            <Badge>Identificação fictícia</Badge>
          </Card>
          <Card title="Próximos passos">
            <p>
              Revisar formulários, acompanhar oportunidades e orientar o
              atendimento.
            </p>
            <NavButton href={`/app/clientes/${id}/formularios`}>
              Explorar formulários
            </NavButton>
            <p>
              <NavButton href="/app/inbox">Abrir Inbox da clínica</NavButton>
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
