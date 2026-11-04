"use client";
import { useState } from "react";
import {
  Settings,
  CalendarDays,
  MessagesSquare,
  Webhook,
  Users,
  Wallet,
  ReceiptText,
  Archive,
  Database,
} from "lucide-react";
import { Heading, Badge } from "@/components/layout/shared";
import { TeamPage } from "@/features/team/team";
import { ServiceCalendar } from "./calendar";
const tabs = [
  {
    id: "general",
    title: "Geral",
    icon: Settings,
    description: "Preferências gerais da plataforma e da operação.",
  },
  {
    id: "calendar",
    title: "Calendário de atendimento",
    icon: CalendarDays,
    description: "Expediente, dias úteis e feriados da equipe.",
  },
  {
    id: "whatsapp",
    title: "Conexão WhatsApp",
    icon: MessagesSquare,
    description: "Conexões e canais de WhatsApp da operação.",
  },
  {
    id: "webhooks",
    title: "Webhooks",
    icon: Webhook,
    description: "Destinos, eventos e notificações das integrações.",
  },
  {
    id: "team",
    title: "Equipe",
    icon: Users,
    description: "Membros, funções e permissões de acesso.",
  },
  {
    id: "commissions",
    title: "Comissões",
    icon: Wallet,
    description: "Regras, metas e critérios de comissão da equipe.",
  },
  {
    id: "invoices",
    title: "Central de faturas",
    icon: ReceiptText,
    description:
      "Faturas e cobranças por cliente: boleto mensal, cartão em até 12x ou antecipado à vista. Emissão e pagamentos serão conectados em uma próxima etapa.",
  },
  {
    id: "backup",
    title: "Backup",
    icon: Archive,
    description: "Rotinas de backup e recuperação dos dados.",
  },
  {
    id: "database",
    title: "Banco de dados",
    icon: Database,
    description: "Conexão, armazenamento e administração dos dados.",
  },
] as const;
export function SettingsPage() {
  const [selected, setSelected] = useState<string>("general");
  const active = tabs.find((t) => t.id === selected)!;
  return (
    <>
      <Heading
        eyebrow="ADMINISTRAÇÃO"
        title="Configurações"
        description="Organize as preferências e os serviços do Atend Hub"
      />
      <div className="settings-layout">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Seções de configurações"
          aria-orientation="vertical"
          onKeyDown={(e) => {
            const index = tabs.findIndex((t) => t.id === selected);
            let next = index;
            if (e.key === "ArrowDown") next = (index + 1) % tabs.length;
            else if (e.key === "ArrowUp")
              next = (index - 1 + tabs.length) % tabs.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = tabs.length - 1;
            else return;
            e.preventDefault();
            setSelected(tabs[next].id);
            document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
          }}
        >
          {tabs.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-controls="settings-panel"
              aria-selected={selected === id}
              tabIndex={selected === id ? 0 : -1}
              onClick={() => setSelected(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{title}</span>
              {id !== "calendar" && id !== "team" && (
                <span className="settings-soon">Em breve</span>
              )}
            </button>
          ))}
        </div>
        <section
          className="settings-panel"
          role="tabpanel"
          id="settings-panel"
          aria-labelledby={`settings-tab-${selected}`}
          tabIndex={0}
        >
          {selected === "calendar" ? (
            <ServiceCalendar />
          ) : selected === "team" ? (
            <TeamPage />
          ) : (
            <div className="settings-placeholder">
              <active.icon size={30} aria-hidden="true" />
              <Badge>Em breve</Badge>
              <h2>{active.title}</h2>
              <p>{active.description}</p>
              <small>
                Esta seção está reservada para as próximas configurações.
              </small>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
