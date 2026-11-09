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
  PanelLeftOpen,
  X,
  Layers2,
  Megaphone,
  Workflow,
  Repeat2,
  BellRing,
} from "lucide-react";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useDemo } from "./demo-context";

import { DemoNotice } from "./shared";
export function Shell({
  children,
  portal = false,
}: {
  children: ReactNode;
  portal?: boolean;
}) {
  const { clientId, setClientId, authorizedClients: remoteClients } = useDemo();
  const pathname = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const match = pathname.match(/\/app\/clientes\/([^/]+)/);
    const routeClientId = match?.[1];
    if (routeClientId && remoteClients?.some((client) => client.id === routeClientId)) setClientId(routeClientId);
  }, [pathname, remoteClients, setClientId]);
  const navigation = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuTrigger.current;
    document.body.style.overflow = "hidden";
    navigation.current
      ?.querySelector<HTMLButtonElement>(".sidebar-mobile-close")
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuTrigger.current?.focus();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          navigation.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
        ).filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 900) setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => trigger?.focus());
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);
  const clinics = remoteClients;
  const links = portal
    ? ([
        ["/portal", "Visão geral", LayoutDashboard],
        ["/portal/agendamentos", "Agendamentos", CalendarDays],
      ] as const)
    : ([
        ["/app", "Visão geral", LayoutDashboard],
        ["/app/leads", "Leads e CRM", Users],
        ["/app/agendamentos", "Agendamentos", CalendarDays],
        ["/app/follow-up", "Follow-up", Repeat2],
        ["/app/confirmacoes", "Confirmações e lembretes", BellRing],
        [`/app/clientes/${clientId}/formularios`, "Formulários", FileText],
      ] as const);
  const systemLinks = [
    ["/app/sistema", "Dashboard geral", LayoutDashboard],
    ["/app/fila", "Fila de atendimento", ListTodo],
    ["/app/clientes", "Clientes", Building2],
    ["/app/inbox", "Inbox", MessagesSquare],
    ["/app/calendario", "Calendário", CalendarDays],
    ["/app/automacoes", "Automações", Workflow],
    ["/app/trafego-pago", "Tráfego Pago", Megaphone],
    ["/app/configuracoes", "Configurações", Settings],
  ] as const;
  const systemPage = !portal && systemLinks.find(([href]) => pathname === href);
  return (
    <div className={`shell ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      {open && (
        <button
          className="navigation-scrim"
          aria-label="Fechar navegação"
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
            menuTrigger.current?.focus();
          }}
        />
      )}
      <aside
        ref={navigation}
        id="sidebar"
        aria-label="Navegação do aplicativo"
        className={`sidebar ${open ? "is-open" : ""}`}
      >
        <button
          className="sidebar-mobile-close button button-ghost button-icon"
          aria-label="Fechar menu"
          onClick={() => {
            setOpen(false);
            menuTrigger.current?.focus();
          }}
        >
          <X size={20} />
        </button>
        <Link
          href={portal ? "/portal" : "/app"}
          className="brand hub-brand"
          aria-label="Atend&Hub — início"
        >
          <span className="hub-symbol" aria-hidden="true">
            <Layers2 size={23} strokeWidth={2} />
          </span>
          <span className="hub-wordmark">
            Atend<span>&</span>Hub
          </span>
        </Link>
        <div className="workspace-pill">
          <span className="avatar">G</span>
          <span className="workspace-name">
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
              {systemLinks.map(([href, label, Icon]) => (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </>
        )}
        <p className="nav-label">{portal ? "PORTAL" : "WORKSPACE"}</p>
        <nav aria-label="Navegação principal">
          {links.map(([href, label, Icon]) => (
            <Link
              onClick={() => setOpen(false)}
              aria-current={
                [...links]
                  .sort((a, b) => b[0].length - a[0].length)
                  .find(([target]) =>
                    target === "/app" || target === "/portal"
                      ? pathname === target
                      : pathname.startsWith(target),
                  )?.[0] === href
                  ? "page"
                  : undefined
              }
              title={label}
              key={href}
              href={href}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            aria-label={portal ? "Voltar à operação" : "Conhecer portal"}
            href={portal ? "/app" : "/portal"}
          >
            <span>{portal ? "Voltar à operação" : "Conhecer portal"}</span>
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <button
          className="sidebar-collapse button button-ghost"
          aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
          <span>Recolher menu</span>
        </button>
      </aside>
      <div className="workspace" inert={open || undefined}>
        <header className="topbar">
          <button
            ref={menuTrigger}
            className="mobile-menu"
            aria-controls="sidebar"
            aria-label="Alternar navegação"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <PanelLeftClose size={20} />
          </button>
          <div className="context-label">
            <span className="context-parent">
              {portal ? "Portal" : systemPage ? "Sistema" : "Workspace"}
            </span>
            <span aria-hidden="true">/</span>
            <span>
              {portal
                ? "Clínica"
                : systemPage
                  ? systemPage[1]
                  : pathname.startsWith("/app/clientes/") &&
                      !pathname.includes("formularios")
                    ? "Perfil do cliente"
                    : (links.find(
                        ([href]) =>
                          href !== "/app" && pathname.startsWith(href),
                      )?.[1] ?? "Visão geral")}
            </span>
          </div>
          <div className="topbar-controls">
            {systemPage ? (
              <span className="badge badge-neutral">
                {pathname === "/app/inbox"
                  ? "Meus atendimentos · todos os clientes"
                  : "Todos os clientes"}
              </span>
            ) : (
              <>
                <label className="sr-only" htmlFor="clinic">
                  Clínica em contexto
                </label>
                <select
                  id="clinic"
                  value={clientId}
                  disabled={clinics.length === 0}
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
              </>
            )}
            <details className="account-menu">
              <summary aria-label="Perfil da sessão">
                <span className="avatar">OD</span>
              </summary>
              <div className="account-popover">
                <strong>Operadora</strong>
                <small>GlowUp · Atendimento</small>
                <Link
                  aria-label={portal ? "Voltar à operação" : "Conhecer portal"}
                  href={portal ? "/app" : "/portal"}
                >
                  {portal ? "Voltar à operação" : "Conhecer portal"}
                </Link>
              </div>
            </details>
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
