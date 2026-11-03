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
  Activity,
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
        ["/app/fila", "Fila de atendimento", ListTodo],
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
        <Link href={portal ? "/portal" : "/app"} className="brand">
          <span className="brand-symbol">
            p<span>✦</span>
          </span>
          <span>
            prescrita<small>INTELIGÊNCIA NO CUIDAR</small>
          </span>
        </Link>
        <div className="workspace-pill">
          <span className="avatar">G</span>
          <span>
            GlowUp
            <small>{portal ? "Portal da clínica" : "Operação de saúde"}</small>
          </span>
        </div>
        <p className="nav-label">
          {portal ? "PORTAL DEMONSTRATIVO" : "WORKSPACE"}
        </p>
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
          <div className="support-box">
            <Activity size={18} />
            <strong>Operação humana</strong>
            <p>Contexto, cuidado e continuidade em cada atendimento.</p>
          </div>
          <Link href={portal ? "/app" : "/portal"}>
            {portal ? "Voltar à operação DEMO" : "Conhecer portal DEMO"}
            <ArrowUpRight size={15} />
          </Link>
          <small>
            Prescrita · por GlowUp
            <br />
            Ambiente demonstrativo · v0.1
          </small>
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
              <option disabled>Jurídico · futuro</option>
            </select>
            <span className="avatar">OD</span>
          </div>
        </header>
        <DemoNotice />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer>
          Prescrita · Atendimento humano, com contexto.
          <span>Simulação em memória · sem autenticação real</span>
        </footer>
      </div>
    </div>
  );
}
