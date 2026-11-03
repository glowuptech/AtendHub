import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
export function DemoNotice() {
  return (
    <div className="demo-notice">
      <FlaskConical size={15} />
      <span>
        Dados fictícios — MVP visual — integrações ainda não conectadas
      </span>
      <span className="demo-tag">C0 + C1</span>
    </div>
  );
}
export function Heading({
  eyebrow = "CENTRAL DE OPERAÇÃO",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function NavButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={buttonVariants({ variant: "outline", size: "sm" })}
      href={href}
    >
      {children}
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function Empty({
  title = "Nenhum registro neste recorte",
  description = "Ajuste os filtros para consultar outros dados fictícios.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty" role="status">
      <span className="empty-mark">○</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function Denied() {
  return (
    <Empty
      title="Recurso indisponível neste contexto"
      description="Selecione a clínica correspondente ou volte à lista. Os mocks verificam o escopo; autenticação e RLS serão implementadas em C2."
    />
  );
}
export const stageLabels = {
  new: "Novo",
  in_progress: "Em atendimento",
  waiting: "Aguardando resposta",
  scheduled: "Agendado",
  lost: "Perdido",
};
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
