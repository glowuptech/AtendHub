"use client";
import { useState } from "react";
import { Client, KnowledgeEntry } from "@/domain/schemas";
import { useDemo } from "@/components/layout/demo-context";
import { Card } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";

const topics: [string, string][] = [
  ["Agendamento", "Como funciona o agendamento e a confirmação?"],
  ["Agendamento", "Quais são os horários, endereço e modalidades de atendimento?"],
  ["Agendamento", "Quais dados são necessários para o cadastro e quando solicitar?"],
  ["Agendamento", "Como funcionam cancelamentos, remarcações e atrasos?"],
  ["Consultas", "Quanto tempo dura a consulta e o que está incluído?"],
  ["Consultas", "Como funciona o retorno e qual é o prazo?"],
  ["Consultas", "Como funciona o acompanhamento pré-natal em cada etapa?"],
  ["Serviços e valores", "Quais serviços, exames e procedimentos são oferecidos?"],
  ["Serviços e valores", "Quais são os pacotes, inclusões e cobranças separadas?"],
  ["Convênios e pagamento", "Quais convênios são aceitos e para quais serviços?"],
  ["Convênios e pagamento", "Como funcionam valores por convênio, reembolso e autorizações?"],
  ["Convênios e pagamento", "Quais formas de pagamento, parcelamentos e descontos são autorizados?"],
  ["Orientações", "Qual é o preparo necessário para cada exame ou procedimento?"],
  ["Orientações", "Quando encaminhar uma dúvida à equipe médica?"],
  ["Orientações", "Como acolher objeções de preço e dúvidas frequentes?"],
];
const empty = (id: string, category: string, question: string): KnowledgeEntry => ({ id, category, question, answer: "", source: "", status: "draft", updatedAt: null, priceCents: null, currency: "BRL", conditions: "" });
const labels = { draft: "Rascunho", pending: "Confirmar com a clínica", approved: "Aprovado" };
export function KnowledgeBase({ client }: { client: Client }) {
  const { repositories, refresh } = useDemo();
  const entries = [...topics.map(([category, question], i) => client.knowledge.find(e => e.id === `standard-${i}`) ?? empty(`standard-${i}`, category, question)), ...client.knowledge.filter(e => !e.id.startsWith("standard-"))];
  const [draft, setDraft] = useState<KnowledgeEntry | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const patch = (v: Partial<KnowledgeEntry>) => setDraft(d => d ? { ...d, ...v } : d);
  const edit = (e: KnowledgeEntry) => { setDraft({...e}); setError(""); setMessage(""); };
  return <div className="profile-information">
    <Card title="Base de conhecimento">
      <p>Processos, serviços e respostas para apoiar o atendimento desta clínica.</p>
      <p>{entries.filter(e => e.status === "approved").length} aprovadas · {entries.filter(e => !e.answer).length} sem resposta · {entries.filter(e => e.status === "pending").length} pendentes</p>
      <div className="tabs"><Button onClick={() => edit(empty(crypto.randomUUID(), "Personalizadas", ""))}>Adicionar pergunta</Button><Button variant="outline" onClick={() => edit(empty(crypto.randomUUID(), "Serviços e valores", ""))}>Adicionar serviço e valor</Button></div>

    </Card>
    {draft && <Card title={draft.id.startsWith("standard-") ? "Editar resposta padrão" : "Editar pergunta ou serviço"}>
      <form onSubmit={e => { e.preventDefault(); try {
        const updated = {...draft, updatedAt: new Date().toISOString()};
        repositories.clients.update(client.id, {...client, knowledge: [...client.knowledge.filter(v => v.id !== draft.id), updated]});
        refresh(); setDraft(null); setMessage("Base de conhecimento atualizada."); setError("");
      } catch { setError("Confira os campos. Para aprovar, preencha a resposta e sua fonte. O valor deve ser positivo, com até duas casas decimais."); } }}>
        <div className="profile-info-grid">
          <label>Pergunta ou nome do serviço<input required minLength={3} maxLength={300} value={draft.question} onChange={e => patch({question:e.target.value})}/></label>
          <label>Categoria<input required maxLength={100} value={draft.category} onChange={e => patch({category:e.target.value})}/></label>
          <label>Resposta / descrição<textarea rows={6} maxLength={6000} value={draft.answer} onChange={e => patch({answer:e.target.value})}/></label>
          <label>Condições, inclusões e exceções<textarea rows={6} maxLength={2000} value={draft.conditions} onChange={e => patch({conditions:e.target.value})}/></label>
          <label>Valor em reais (opcional)<input type="number" min="0" step="0.01" value={draft.priceCents === null ? "" : draft.priceCents / 100} onChange={e => patch({priceCents:e.target.value === "" ? null : Math.round(Number(e.target.value)*100)})}/></label>
          <label>Fonte / documento e versão<input maxLength={500} value={draft.source} onChange={e => patch({source:e.target.value})}/></label>
          <label>Status<select value={draft.status} onChange={e => patch({status:e.target.value as KnowledgeEntry["status"]})}>{Object.entries(labels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <p>Em caso de divergência, registre as duas versões e marque “Confirmar com a clínica”. Campo vazio significa não informado, nunca gratuidade ou cobertura confirmada.</p>
        {error && <p role="alert">{error}</p>}
        <div className="tabs"><Button type="submit">Salvar resposta</Button><Button type="button" variant="outline" onClick={() => {setDraft(null);setError("");}}>Cancelar</Button></div>
      </form>
    </Card>}
    <p role="status">{message}</p>
    <div className="profile-info-grid">
      <label>Buscar na base<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pergunta, serviço ou resposta"/></label>
      <label>Categoria<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(entries.map(e => e.category))].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
    {entries.filter(e => (!category || e.category === category) && (!status || e.status === status) && `${e.question} ${e.answer}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).map(e => <Card key={e.id} title={e.question}>
      <small>{e.category} · {labels[e.status]}</small>
      <p style={{whiteSpace:"pre-wrap"}}>{e.answer || "Ainda não preenchido. Confirme a informação com a clínica."}</p>
      {e.priceCents !== null && <p><strong>{(e.priceCents/100).toLocaleString("pt-BR", {style:"currency", currency:e.currency})}</strong></p>}
      {e.conditions && <p style={{whiteSpace:"pre-wrap"}}>Condições: {e.conditions}</p>}
      <p><small>Fonte: {e.source || "Não informada"} · Atualização: {e.updatedAt ? new Date(e.updatedAt).toLocaleDateString("pt-BR") : "Não revisado"}</small></p>
      <Button variant="outline" onClick={() => edit(e)}>Editar</Button>
    </Card>)}
  </div>;
}
