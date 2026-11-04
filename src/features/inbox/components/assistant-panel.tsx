"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Copy,
  CornerUpLeft,
  BookOpen,
  LoaderCircle,
} from "lucide-react";
import type { Client } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import {
  unavailableAssistant,
  type AssistantAnswer,
  type AssistantService,
} from "../services/assistant";
export function AssistantPanel({
  client,
  conversationId,
  onInsert,
  service = unavailableAssistant,
}: {
  client: Client;
  conversationId: string;
  onInsert: (text: string) => void;
  service?: AssistantService;
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<
    { question: string; answer: AssistantAnswer }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const approved = client.knowledge.filter(
    (entry) => entry.status === "approved" && entry.answer && entry.source,
  );
  async function ask() {
    if (!service.available || !question.trim() || busy) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const sent = question.trim();
    setBusy(true);
    setError("");
    try {
      const answer = await service.ask(
        { conversationId, question: sent },
        request.signal,
      );
      if (request.signal.aborted) return;
      if (answer.conversationId !== conversationId)
        throw new Error("Contexto da resposta inválido.");
      setHistory((previous) => [...previous, { question: sent, answer }]);
      setQuestion("");
    } catch {
      if (!request.signal.aborted)
        setError("Não foi possível consultar a base. Tente novamente.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Resposta copiada.");
    } catch {
      setNotice(
        "Não foi possível copiar. Selecione o texto e copie manualmente.",
      );
    }
  }
  function responseActions(text: string) {
    return (
      <div className="assistant-response-actions">
        <Button size="sm" variant="ghost" onClick={() => void copy(text)}>
          <Copy size={14} />
          Copiar resposta
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onInsert(text);
            setNotice("Texto inserido no rascunho. Revise antes de enviar.");
          }}
        >
          <CornerUpLeft size={14} />
          Inserir no WhatsApp
        </Button>
      </div>
    );
  }
  return (
    <section className="inbox-assistant" aria-label="Assistente IA">
      <header className="assistant-header">
        <div>
          <Sparkles size={18} />
          <h2>Assistente IA</h2>
          <span className="assistant-private">Interno</span>
        </div>
        <small>Base de conhecimento: {client.name}</small>
      </header>
      <div
        className="assistant-history"
        tabIndex={0}
        aria-label="Histórico e fontes do assistente"
      >
        {!history.length && (
          <div className="assistant-empty">
            <span className="assistant-emblem">
              <Sparkles size={24} />
            </span>
            <h3>
              {service.available
                ? "Como posso ajudar?"
                : "Sua base, ao lado da conversa"}
            </h3>
            <p>
              {service.available
                ? "Pergunte sobre as informações cadastradas para este cliente."
                : "A IA ainda não está conectada. Consulte abaixo as informações aprovadas do cliente."}
            </p>
            <small>Este espaço é interno. Nada é enviado ao contato.</small>
          </div>
        )}
        {history.map((entry, i) => (
          <article className="assistant-exchange" key={i}>
            <p className="assistant-question">{entry.question}</p>
            <div className="assistant-answer">
              <p>{entry.answer.text}</p>
              {entry.answer.sources.length > 0 && (
                <details>
                  <summary>Fontes utilizadas</summary>
                  {entry.answer.sources.map((source) => (
                    <p key={source.id}>
                      <strong>{source.title}</strong>
                      <small>{source.reference}</small>
                    </p>
                  ))}
                </details>
              )}
              {responseActions(entry.answer.text)}
            </div>
          </article>
        ))}
        {busy && (
          <p className="assistant-working" role="status">
            <LoaderCircle size={16} />
            Consultando a base…
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {!service.available && (
          <details className="assistant-knowledge">
            <summary>
              <BookOpen size={15} />
              Consultar base cadastrada <span>{approved.length}</span>
            </summary>
            {approved.length ? (
              approved.map((entry) => (
                <article key={entry.id}>
                  <h3>{entry.question}</h3>
                  <p>{entry.answer}</p>
                  {entry.priceCents !== null && (
                    <p>
                      Valor cadastrado:{" "}
                      {(entry.priceCents / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: entry.currency,
                      })}
                    </p>
                  )}
                  {entry.conditions && <p>{entry.conditions}</p>}
                  <small>Fonte: {entry.source}</small>
                  {responseActions(
                    [
                      entry.answer,
                      entry.priceCents !== null
                        ? `Valor cadastrado: ${(entry.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: entry.currency })}`
                        : "",
                      entry.conditions,
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                  )}
                </article>
              ))
            ) : (
              <p>Nenhuma resposta aprovada disponível nesta base.</p>
            )}
          </details>
        )}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="sr-only" htmlFor={`assistant-${conversationId}`}>
          Pergunta ao assistente interno
        </label>
        <textarea
          id={`assistant-${conversationId}`}
          rows={2}
          value={question}
          maxLength={2000}
          disabled={!service.available || busy}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            service.available
              ? "Pergunte à base deste cliente…"
              : "Disponível após conectar a IA"
          }
        />
        <Button
          size="icon"
          aria-label="Enviar pergunta à IA"
          disabled={!service.available || busy || !question.trim()}
          type="submit"
        >
          <Send size={16} />
        </Button>
        <p role="status" className="assistant-feedback">
          {notice ||
            (!service.available
              ? "Integração pendente"
              : "Revise as respostas antes de utilizar.")}
        </p>
      </form>
    </section>
  );
}
