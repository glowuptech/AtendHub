"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  MessagesSquare,
  ListTodo,
  CalendarDays,
  FileText,
  Settings,
  ArrowUpRight,
  PanelLeftClose,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useDemo } from "./demo-context";

import { DemoNotice } from "./shared";
export function Shell({
  children,
  portal = false,
}: {
  children: ReactNode;
  portal?: boolean;
}) {
  const { scope, repositories, clientId, setClientId } = useDemo();
  const pathname = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const clinics = repositories.clients.list(scope);
  const links = portal
    ? ([
        ["/portal", "Visão geral", LayoutDashboard],
        ["/portal/agendamentos", "Agendamentos", CalendarDays],
      ] as const)
    : ([
        ["/app", "Visão geral", LayoutDashboard],
        ["/app/clientes", "Clínicas", Building2],
        ["/app/leads", "Leads e CRM", Users],
        ["/app/inbox", "Inbox", MessagesSquare],
        ["/app/agendamentos", "Agendamentos", CalendarDays],
        [`/app/clientes/${clientId}/formularios`, "Formulários", FileText],
        ["/app/configuracoes", "Configurações", Settings],
      ] as const);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href={portal ? "/portal" : "/app"} className="brand hub-brand">
          <span className="hub-symbol" aria-hidden="true">
            a<span>h</span>
          </span>
          <span className="hub-wordmark">Atend Hub</span>
        </Link>
        <div className="workspace-pill">
          <span className="avatar">G</span>
          <span>
            GlowUp
            <small>
              {portal ? "Portal da clínica" : "Gestão de atendimento"}
            </small>
          </span>
        </div>
        {!portal && (
          <>
            <p className="nav-label">SISTEMA</p>
            <nav aria-label="Sistema">
              <Link
                href="/app/fila"
                aria-current={pathname === "/app/fila" ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <ListTodo size={18} />
                Fila de atendimento
              </Link>
            </nav>
          </>
        )}
        <p className="nav-label">{portal ? "PORTAL" : "WORKSPACE"}</p>
        <nav aria-label="Navegação principal">
          {links.map(([href, label, Icon]) => (
            <Link
              onClick={() => setOpen(false)}
              aria-current={
                (
                  href === "/app" || href === "/portal"
                    ? pathname === href
                    : pathname.startsWith(href)
                )
                  ? "page"
                  : undefined
              }
              key={href}
              href={href}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href={portal ? "/app" : "/portal"}>
            {portal ? "Voltar à operação" : "Conhecer portal"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Alternar navegação"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <PanelLeftClose size={20} />
          </button>
          <div className="context-label">
            <span className="status-dot" />{" "}
            {portal ? "Portal da clínica" : "Central de atendimento"}
          </div>
          <div className="topbar-controls">
            <label className="sr-only" htmlFor="clinic">
              Clínica em contexto
            </label>
            <select
              id="clinic"
              value={clientId}
              onChange={(e) => {
                const id = e.target.value;
                setClientId(id);
                if (pathname.includes("/clientes/"))
                  router.push(`/app/clientes/${id}`);
                else if (pathname.includes("/leads/"))
                  router.push("/app/leads");
              }}
            >
              {clinics.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="vertical">
              Vertical
            </label>
            <select id="vertical" defaultValue="healthcare">
              <option value="healthcare">Saúde · Prescrita</option>
              <option disabled>Jurídico · Veredite</option>
            </select>
            <span className="avatar">OD</span>
          </div>
        </header>
        <DemoNotice />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
