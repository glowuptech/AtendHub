"use client";
import { Production } from "@/features/production/board";
import { useState } from "react";
import { useClients } from "../hooks";

import { Heading, Card, Denied } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { useLeads } from "@/features/leads/hooks";
import { localDay, shiftDay } from "@/lib/date-range";
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
  const { data: clients, error, isLoading } = useClients();
  const [tab, setTab] = useState("Visão geral");
  const [today] = useState(() => localDay(new Date().toISOString()));
  const [range, setRange] = useState(() => ({
    from: shiftDay(today, -29),
    to: today,
  }));
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
          "Produção",
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
          today={today}
          range={range}
          onPeriodChange={setRange}
          onPaidMedia={() => setTab("Tráfego pago")}
          onEdit={() => setTab("Informações")}
        />
      ) : tab === "Informações" ? (
        <ClientInformation key={id} client={c} />
      ) : tab === "Leads" ? (
        <ClientLeads clientId={id} />
      ) : tab === "Formulários" ? (
        <FormsList id={id} />
      ) : tab === "Agendamento externo" ? (
        <ExternalScheduling key={id} clientId={id} />
      ) : tab === "Acessos" ? (
        <ClientAccesses key={id} clientId={id} />
      ) : tab === "Domínio público" ? (
        <ClientDomainSettings key={id} clientId={id} />
      ) : tab === "Produção" ? (
        <Production key={id} fixedClient={id} />
      ) : tab === "Tráfego pago" ? (
        <section aria-label="Dashboard de tráfego pago do cliente">
          <PaidMediaWorkspace
            key={id}
            clientId={id}
            period={range}
            onPeriodChange={setRange}
            embedded
          />
        </section>
      ) : tab === "Base de conhecimento" ? (
        <KnowledgeBase key={id} client={c} />
      ) : null}
    </>
  );
}

function ClientLeads({ clientId }: { clientId: string }) {
  const { data, error, isLoading, mutate } = useLeads({ clientId });
  return (
    <Card>
      {isLoading && <p role="status">Carregando leads…</p>}
      {error && (
        <>
          <p role="alert">{error.message}</p>
          <Button variant="outline" onClick={() => mutate()}>
            Tentar novamente
          </Button>
        </>
      )}
      {data && !error && <LeadTable leads={data} />}
    </Card>
  );
}
