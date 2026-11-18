"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  BookOpen,
  Copy,
  CornerUpLeft,
  LoaderCircle,
  RotateCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assistantService,
  type AssistantExchange,
  type AssistantHistory,
} from "../services/assistant";

const statusLabels = {
  processing: "Consultando",
  succeeded: "Concluída",
  failed: "Falhou",
  uncertain: "Não confirmada",
} as const;

async function fetchHistory(conversationId: string) {
  return assistantService.history(conversationId);
}

export function AssistantPanel({
  clientName,
  conversationId,
  onInsert,
}: {
  clientName: string;
  conversationId: string;
  onInsert: (text: string) => void;
}) {
  const historyKey = `/api/inbox/conversations/${conversationId}/assistant`;
  const {
    data,
    error: historyError,
    isLoading,
    mutate,
  } = useSWR<AssistantHistory>(historyKey, () => fetchHistory(conversationId), {
    refreshInterval: (current) =>
      current?.exchanges.some((exchange) => exchange.status === "processing")
        ? 3000
        : 0,
    revalidateOnFocus: true,
    keepPreviousData: false,
  });
  const [question, setQuestion] = useState("");
  const [localExchanges, setLocalExchanges] = useState<AssistantExchange[]>([]);
  const [olderExchanges, setOlderExchanges] = useState<AssistantExchange[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const serverExchanges = data?.exchanges;
  const exchanges = useMemo(() => {
    const byRequest = new Map<string, AssistantExchange>();
    for (const exchange of [
      ...olderExchanges,
      ...localExchanges,
      ...(serverExchanges ?? []),
    ])
      byRequest.set(exchange.requestId, exchange);
    return [...byRequest.values()].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }, [olderExchanges, localExchanges, serverExchanges]);
  const hasMore = olderExchanges.length
    ? (olderHasMore ?? false)
    : (data?.hasMore ?? false);
  const oldest = exchanges[0];
  const pending = exchanges.some((exchange) => exchange.status === "processing");
  const busy = sending || pending;
  const configured = data?.webhookConfigured ?? false;

  async function refreshHistory() {
    const latest = await mutate();
    if (latest) {
      const latestIds = new Set(latest.exchanges.map((exchange) => exchange.requestId));
      setLocalExchanges((current) =>
        current.filter((exchange) => !latestIds.has(exchange.requestId)),
      );
    }
  }

  async function loadOlder() {
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const page = await assistantService.history(conversationId, oldest.id);
      setOlderExchanges((current) => [...page.exchanges, ...current]);
      setOlderHasMore(page.hasMore);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar as perguntas anteriores.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  function replaceLocal(requestId: string, exchange: AssistantExchange) {
    setLocalExchanges((current) => {
      const exists = current.some((item) => item.requestId === requestId);
      return exists
        ? current.map((item) => (item.requestId === requestId ? exchange : item))
        : [...current, exchange];
    });
  }

  async function runRequest(input: {
    question: string;
    requestId: string;
    threadId: string | null;
    existing?: AssistantExchange;
  }) {
    const optimistic: AssistantExchange = input.existing
      ? { ...input.existing, status: "processing", error: null }
      : {
          id: input.requestId,
          requestId: input.requestId,
          eventId: input.requestId,
          question: input.question,
          status: "processing",
          attemptCount: 1,
          error: null,
          answer: null,
          sources: [],
          suggestedReply: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
    replaceLocal(input.requestId, optimistic);
    setSending(true);
    setError("");
    setNotice("");
    try {
      const result = await assistantService.ask({
        conversationId,
        question: input.question,
        requestId: input.requestId,
        threadId: input.threadId,
      });
      replaceLocal(input.requestId, result.exchange);
      await refreshHistory();
      if (result.exchange.status === "succeeded")
        setNotice("Resposta salva no histórico interno. Revise antes de usar.");
    } catch (cause) {
      replaceLocal(input.requestId, {
        ...optimistic,
        status: "uncertain",
        error:
          cause instanceof Error
            ? cause.message
            : "A conexão foi interrompida. Reabra o histórico antes de tentar novamente.",
        updatedAt: new Date().toISOString(),
      });
      await mutate().catch(() => undefined);
    } finally {
      setSending(false);
    }
  }

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy || !configured) return;
    setQuestion("");
    await runRequest({
      question: text,
      requestId: crypto.randomUUID(),
      threadId: data?.threadId ?? null,
    });
  }

  async function retry(exchange: AssistantExchange) {
    if (busy || exchange.status === "succeeded") return;
    await runRequest({
      question: exchange.question,
      requestId: exchange.requestId,
      threadId: data?.threadId ?? null,
      existing: exchange,
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Texto copiado.");
    } catch {
      setNotice("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function insert(text: string) {
    onInsert(text);
    setNotice("Texto acrescentado ao rascunho da conversa. Revise antes de enviar.");
  }

  return (
    <section className="inbox-assistant" aria-label="Assistente IA interno">
      <header className="assistant-header">
        <div>
          <Sparkles size={18} aria-hidden="true" />
          <h2>Assistente IA</h2>
          <span className="assistant-private">Privado</span>
        </div>
        <small>
          {clientName} · {configured ? "Webhook configurado" : "Webhook não configurado"}
        </small>
      </header>
      <div
        className="assistant-history"
        tabIndex={0}
        aria-label="Histórico e fontes do assistente"
      >
        {hasMore && (
          <div className="inbox-load-older">
            <Button size="sm" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? "Carregando…" : "Carregar perguntas anteriores"}
            </Button>
          </div>
        )}
        {isLoading && !exchanges.length && (
          <p className="assistant-status" role="status">
            <LoaderCircle size={15} /> Carregando histórico privado…
          </p>
        )}
        {historyError && !isLoading && (
          <div className="assistant-empty" role="alert">
            <h3>Não foi possível carregar o histórico</h3>
            <p>{historyError.message}</p>
            <Button size="sm" variant="outline" onClick={() => void mutate()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!isLoading && !historyError && !exchanges.length && (
          <div className="assistant-empty">
            <span className="assistant-emblem"><Sparkles size={22} /></span>
            <h3>{configured ? "Pergunte sobre esta conversa" : "Configure o webhook do assistente"}</h3>
            <p>
              {configured
                ? data?.knowledge.empty
                  ? "A base aprovada está vazia. O workflow deve informar quando não encontrar dados, sem inventar respostas."
                  : `Base aprovada disponível: ${data?.knowledge.approvedCount ?? 0} itens.`
                : "Acesse Configurações → Webhooks → Assistente IA. O cadastro da URL não confirma que o workflow está disponível."}
            </p>
            <small>Uso interno. Perguntas e respostas não são enviadas ao WhatsApp.</small>
          </div>
        )}
        {exchanges.map((exchange) => (
          <article className="assistant-exchange" key={exchange.requestId}>
            <p className="assistant-question">{exchange.question}</p>
            <p className="assistant-request-status" role="status">
              {exchange.status === "processing" && <LoaderCircle size={14} />}
              {statusLabels[exchange.status]}
              {exchange.attemptCount > 1 ? ` · tentativa ${exchange.attemptCount}` : ""}
            </p>
            {exchange.status === "succeeded" && exchange.answer && (
              <div className="assistant-answer">
                <p>{exchange.answer}</p>
                {exchange.sources.length > 0 && (
                  <details>
                    <summary><BookOpen size={14} /> Fontes utilizadas ({exchange.sources.length})</summary>
                    {exchange.sources.map((source) => (
                      <p className="assistant-source" key={source.id}>
                        <strong>{source.title}</strong>
                        <small>{source.reference}</small>
                      </p>
                    ))}
                  </details>
                )}
                {exchange.suggestedReply && (
                  <section className="assistant-suggested" aria-label="Sugestão de texto para o contato">
                    <h3>Sugestão para o contato</h3>
                    <p>{exchange.suggestedReply}</p>
                    <Button size="sm" variant="outline" onClick={() => insert(exchange.suggestedReply!)}>
                      <CornerUpLeft data-icon="inline-start" /> Inserir sugestão no rascunho
                    </Button>
                  </section>
                )}
                <div className="assistant-response-actions">
                  <Button size="sm" variant="ghost" onClick={() => void copy(exchange.answer!)}>
                    <Copy data-icon="inline-start" /> Copiar resposta interna
                  </Button>
                  {!exchange.suggestedReply && (
                    <Button size="sm" variant="outline" onClick={() => insert(exchange.answer!)}>
                      <CornerUpLeft data-icon="inline-start" /> Inserir resposta no rascunho
                    </Button>
                  )}
                  {exchange.suggestedReply && (
                    <Button size="sm" variant="ghost" onClick={() => void copy(exchange.suggestedReply!)}>
                      <Copy data-icon="inline-start" /> Copiar sugestão
                    </Button>
                  )}
                </div>
              </div>
            )}
            {(exchange.status === "failed" || exchange.status === "uncertain") && (
              <div className="assistant-failure" role="alert">
                <p>{exchange.error ?? "A resposta não foi confirmada."}</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void retry(exchange)}>
                  <RotateCw data-icon="inline-start" /> Tentar novamente
                </Button>
              </div>
            )}
          </article>
        ))}
        {data?.knowledge.empty && exchanges.length > 0 && (
          <p className="assistant-base-note">
            <BookOpen size={14} /> A base aprovada deste cliente está vazia.
          </p>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <form className="assistant-composer" onSubmit={(event) => void ask(event)}>
        <label className="sr-only" htmlFor={`assistant-${conversationId}`}>
          Pergunta ao assistente interno
        </label>
        <textarea
          id={`assistant-${conversationId}`}
          rows={2}
          value={question}
          maxLength={2000}
          disabled={!configured || busy || Boolean(historyError)}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={configured ? "Pergunte à base aprovada deste cliente…" : "Configure o webhook em Configurações → Webhooks"}
        />
        <Button
          size="icon"
          aria-label="Enviar pergunta à IA"
          disabled={!configured || busy || !question.trim() || Boolean(historyError)}
          type="submit"
        >
          {busy ? <LoaderCircle size={16} /> : <Send size={16} />}
        </Button>
        <p role="status" className="assistant-feedback">
          {notice || (data?.knowledge.empty
            ? "Base aprovada vazia · revise as respostas antes de utilizar."
            : "Somente o atendente decide se e quando enviar uma mensagem.")}
        </p>
      </form>
    </section>
  );
}
