"use client";
import { useState } from "react";

import { useDemo } from "@/components/layout/demo-context";

import { Heading, Card, NavButton, Denied } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { LeadTable } from "@/features/leads/components/lead-table";
import { ClientOverview } from "./overview";
import { ClientInformation } from "./information";
import { KnowledgeBase } from "./knowledge-base";
export { Clients } from "./directory";
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
        description="Informações administrativas  · sem dados clínicos."
      />
      <div className="tabs" aria-label="Seções da clínica">
        {[
          "Visão geral",
          "Informações",
          "Base de conhecimento",
          "Leads",
          "Formulários",
          "Agendamento externo",
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
      {tab === "Visão geral" ? (
        <ClientOverview
          key={id}
          client={c}
          onEdit={() => setTab("Informações")}
        />
      ) : tab === "Informações" ? (
        <ClientInformation key={id} client={c} />
      ) : tab === "Leads" ? (
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
            prévia. Não representa a agenda de uma médica.
          </p>
          <a
            className="button button-primary"
            href={c.externalSchedulingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir sistema de agenda
          </a>
        </Card>
      ) : tab === "Base de conhecimento" ? (
        <KnowledgeBase key={id} client={c} />
      ) : null}
    </>
  );
}
