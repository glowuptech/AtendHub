"use client";
import { useEffect, useState } from "react";
import { FileText, Plus, Archive } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { useClients } from "@/features/clients/hooks";
import { useForms } from "../hooks";
import { Heading, Card, Badge, NavButton, Denied, Empty } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";

export function FormsList({ id }: { id: string }) {
  const { setClientId } = useDemo();
  const { data: clients, error: clientsError, isLoading: clientsLoading } = useClients();
  const { data: forms = [], error, isLoading, mutate } = useForms(id);
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const client = clients?.find((item) => item.id === id);
  useEffect(() => {
    if (client) setClientId(client.id);
  }, [client, setClientId]);
  if (clientsLoading) return <p role="status">Carregando cliente autorizado…</p>;
  if (clientsError) return <p role="alert">Não foi possível consultar os clientes autorizados.</p>;
  if (!client) return <Denied />;
  const visible = forms.filter((form) => status === "all" || form.status === status);
  async function archive(formId: string) {
    const response = await fetch(`/api/forms/${formId}`, { method: "DELETE" });
    setNotice(response.ok ? "Formulário arquivado." : "Não foi possível arquivar o formulário.");
    if (response.ok) void mutate();
  }
  return <>
    <Heading eyebrow={client?.name ?? "Cliente autorizado"} title="Formulários" description="Formulários nativos com a identidade da clínica e campos conectados ao CRM." action={<NavButton href={`/app/clientes/${id}/formularios/novo`}><Plus size={16} />Novo formulário</NavButton>} />
    {clientsError && <p role="alert">Não foi possível carregar os clientes autorizados.</p>}
    {error && <div role="alert"><p>Não foi possível carregar os formulários persistidos.</p><Button variant="outline" onClick={() => { void mutate(); }}>Tentar novamente</Button></div>}
    <div className="toolbar"><label className="push-right">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="demo">Ativo</option><option value="draft">Rascunho</option><option value="archived">Arquivado</option></select></label></div>
    {isLoading ? <p role="status">Carregando formulários…</p> : <div className="cards-grid">{visible.map((form) => { const version = form.versions.find((item) => item.id === form.activeVersionId) ?? form.versions.at(-1); return <Card key={form.id}><div className="section-caption"><span className="large-icon"><FileText /></span><Badge>{form.status === "archived" ? "Arquivado" : form.status === "draft" ? "Rascunho" : "Ativo"}</Badge></div><h2>{form.name}</h2><p>{version?.steps.length ?? 0} perguntas · versão {version?.number ?? 1} · {form.versions.length} versão(ões) preservada(s)</p><div className="actions"><NavButton href={`/app/clientes/${id}/formularios/${form.id}/editar`}>Editar</NavButton><NavButton href={`/app/clientes/${id}/formularios/${form.id}/preview`}>Prévia</NavButton>{form.status !== "draft" && form.status !== "archived" && <NavButton href={`/f/${form.slug}`}>Abrir formulário</NavButton>}<NavButton href="/app/leads">Respostas no CRM</NavButton></div><div className="actions separated"><Button variant="ghost" size="sm" disabled={form.status === "archived"} onClick={() => { void archive(form.id); }}><Archive size={14} />Arquivar</Button></div></Card>; })}</div>}
    {!isLoading && !error && !visible.length && <Empty title="Nenhum formulário" description={status === "all" ? "Crie o primeiro formulário deste cliente." : "Nenhum formulário neste status."} />}
    <p role="status">{notice}</p>
  </>;
}
