"use client";
import { useState } from "react";
import useSWR, { mutate as mutateCache } from "swr";
import type { Client, KnowledgeEntry } from "@/domain/schemas";
import { Card } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";

type KnowledgeResponse = {
  knowledge: KnowledgeEntry[];
  canEdit: boolean;
};

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
const empty = (
  id: string,
  category: string,
  question: string,
): KnowledgeEntry => ({
  id,
  category,
  question,
  answer: "",
  source: "",
  status: "draft",
  updatedAt: null,
  priceCents: null,
  currency: "BRL",
  conditions: "",
});
const labels = {
  draft: "Rascunho",
  pending: "Confirmar com a clínica",
  approved: "Aprovado",
};

async function knowledgeFetcher(url: string): Promise<KnowledgeResponse> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível carregar a base.");
  return body as KnowledgeResponse;
}

export function KnowledgeBase({ client }: { client: Client }) {
  const url = `/api/clients/${client.id}/knowledge`;
  const { data, error: loadError, isLoading, mutate } = useSWR(url, knowledgeFetcher);
  const [draft, setDraft] = useState<KnowledgeEntry | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const knowledge = data?.knowledge ?? [];
  const canEdit = data?.canEdit ?? false;
  const entries = [
    ...topics.map(
      ([topicCategory, question], index) =>
        knowledge.find((entry) => entry.id === `standard-${index}`) ??
        empty(`standard-${index}`, topicCategory, question),
    ),
    ...knowledge.filter((entry) => !entry.id.startsWith("standard-")),
  ];
  const patch = (value: Partial<KnowledgeEntry>) =>
    setDraft((current) => (current ? { ...current, ...value } : current));
  const edit = (entry: KnowledgeEntry) => {
    setDraft({ ...entry });
    setError("");
    setMessage("");
  };

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canEdit) return;
    const updated = { ...draft, updatedAt: new Date().toISOString() };
    const nextKnowledge = [
      ...knowledge.filter((entry) => entry.id !== draft.id),
      updated,
    ];
    setError("");
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge: nextKnowledge }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível salvar a base.");
      await mutate(result as KnowledgeResponse, { revalidate: false });
      await mutateCache("/api/clients");
      setDraft(null);
      setMessage("Base de conhecimento salva no cadastro persistido do cliente.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Confira os campos e tente novamente.",
      );
    }
  }

  return (
    <div className="profile-information">
      <Card title="Base de conhecimento">
        <p>Processos, serviços e respostas para apoiar o atendimento desta clínica.</p>
        {isLoading ? (
          <p role="status">Carregando base aprovada e conteúdo salvo…</p>
        ) : loadError ? (
          <p role="alert" className="field-error">{loadError.message}</p>
        ) : (
          <>
            <p>
              {entries.filter((entry) => entry.status === "approved").length} aprovadas ·{" "}
              {entries.filter((entry) => !entry.answer).length} sem resposta ·{" "}
              {entries.filter((entry) => entry.status === "pending").length} pendentes
            </p>
            {canEdit ? (
              <div className="tabs">
                <Button onClick={() => edit(empty(crypto.randomUUID(), "Personalizadas", ""))}>
                  Adicionar pergunta
                </Button>
                <Button variant="outline" onClick={() => edit(empty(crypto.randomUUID(), "Serviços e valores", ""))}>
                  Adicionar serviço e valor
                </Button>
              </div>
            ) : (
              <p>Você pode consultar a base, mas não tem permissão para editá-la.</p>
            )}
          </>
        )}
      </Card>

      {draft && canEdit && (
        <Card title={draft.id.startsWith("standard-") ? "Editar resposta padrão" : "Editar pergunta ou serviço"}>
          <form onSubmit={(event) => void save(event)}>
            <div className="profile-info-grid">
              <label>Pergunta ou nome do serviço<input required minLength={3} maxLength={300} value={draft.question} onChange={(event) => patch({ question: event.target.value })} /></label>
              <label>Categoria<input required maxLength={100} value={draft.category} onChange={(event) => patch({ category: event.target.value })} /></label>
              <label>Resposta / descrição<textarea rows={6} maxLength={6000} value={draft.answer} onChange={(event) => patch({ answer: event.target.value })} /></label>
              <label>Condições, inclusões e exceções<textarea rows={6} maxLength={2000} value={draft.conditions} onChange={(event) => patch({ conditions: event.target.value })} /></label>
              <label>Valor em reais (opcional)<input type="number" min="0" step="0.01" value={draft.priceCents === null ? "" : draft.priceCents / 100} onChange={(event) => patch({ priceCents: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100) })} /></label>
              <label>Fonte / documento e versão<input maxLength={500} value={draft.source} onChange={(event) => patch({ source: event.target.value })} /></label>
              <label>Status<select value={draft.status} onChange={(event) => patch({ status: event.target.value as KnowledgeEntry["status"] })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <p>Em caso de divergência, registre as duas versões e marque “Confirmar com a clínica”. Campo vazio significa não informado, nunca gratuidade ou cobertura confirmada.</p>
            {error && <p role="alert" className="field-error">{error}</p>}
            <div className="tabs">
              <Button type="submit">Salvar resposta</Button>
              <Button type="button" variant="outline" onClick={() => { setDraft(null); setError(""); }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <p role="status">{message}</p>
      {!isLoading && !loadError && (
        <>
          <div className="profile-info-grid">
            <label>Buscar na base<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pergunta, serviço ou resposta" /></label>
            <label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{[...new Set(entries.map((entry) => entry.category))].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          {entries
            .filter((entry) => (!category || entry.category === category) && (!status || entry.status === status) && `${entry.question} ${entry.answer}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
            .map((entry) => (
              <Card key={entry.id} title={entry.question}>
                <small>{entry.category} · {labels[entry.status]}</small>
                <p style={{ whiteSpace: "pre-wrap" }}>{entry.answer || "Ainda não preenchido. Confirme a informação com a clínica."}</p>
                {entry.priceCents !== null && <p><strong>{(entry.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: entry.currency })}</strong></p>}
                {entry.conditions && <p style={{ whiteSpace: "pre-wrap" }}>Condições: {entry.conditions}</p>}
                <p><small>Fonte: {entry.source || "Não informada"} · Atualização: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString("pt-BR") : "Não revisado"}</small></p>
                {canEdit && <Button variant="outline" onClick={() => edit(entry)}>Editar</Button>}
              </Card>
            ))}
        </>
      )}
    </div>
  );
}
