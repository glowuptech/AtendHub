"use client";
import { useState } from "react";
import { useClients } from "../hooks";

import { useDemo } from "@/components/layout/demo-context";

import { Heading, Card, Denied } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { LeadTable } from "@/features/leads/components/lead-table";
import { ClientOverview } from "./overview";
import { ClientInformation } from "./information";
import { FormsList } from "@/features/forms/components/forms-list";
import { ClientAccesses } from "./client-accesses";
import { ExternalScheduling } from "./external-scheduling";
import { PaidMediaWorkspace } from "@/features/paid-media/workspace";
import { ClientDomainSettings } from "@/features/client-domains/settings";
import { KnowledgeBase } from "./knowledge-base";
export { Clients } from "./directory";
export function ClientProfile({ id }: { id: string }) {
  const { repositories, scope, clientId } = useDemo();
  const { data: clients, error, isLoading } = useClients();
  const [tab, setTab] = useState("Visão geral");
  if (id !== clientId) return <Denied />;
  if (isLoading)
    return (
      <Card>
        <p role="status">Carregando cliente persistido…</p>
      </Card>
    );
  if (error)
    return (
      <Card>
        <p role="alert" className="field-error">
          {error.message}
        </p>
      </Card>
    );
  const c = clients?.find((client) => client.id === id);
  if (!c) return <Denied />;
  return (
    <>
      <Heading
        eyebrow="CLIENTES / PERFIL OPERACIONAL"
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
          "Acessos",
          "Domínio público",
          "Tráfego pago",
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
          <LeadTable
            leads={
              scope.clientIds.includes(id) ? repositories.leads.list(id) : []
            }
          />
        </Card>
      ) : tab === "Formulários" ? (
        <FormsList id={id} />
      ) : tab === "Agendamento externo" ? (
        <ExternalScheduling key={id} clientId={id} />
      ) : tab === "Acessos" ? (
        <ClientAccesses key={id} clientId={id} />
      ) : tab === "Domínio público" ? (
        <ClientDomainSettings key={id} clientId={id} />
      ) : tab === "Tráfego pago" ? (
        <PaidMediaWorkspace key={id} clientId={id} embedded />
      ) : tab === "Base de conhecimento" ? (
        <KnowledgeBase key={id} client={c} />
      ) : null}
    </>
  );
}
