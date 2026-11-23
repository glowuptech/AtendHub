"use client";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/layout/shared";
import { stageLabels, stages, type Plan, type Stage } from "./model";
import type { PaidMediaExchange } from "./assistant-model";
import { requestMedia } from "./transport";

type History = { configured: boolean; items: PaidMediaExchange[] };
type Mode = "analyze" | "generate" | "improve";
const labels = {
  analyze: "Analisar desempenho",
  generate: "Gerar plano completo",
  improve: "Aprimorar ideia",
} as const;

export function MediaAssistant({
  clientId,
  period,
  draft,
  onApply,
  initialMode = "analyze",
  initialStage,
}: {
  clientId: string;
  period: { from: string; to: string };
  draft?: Plan;
  onApply?: (
    changes: Partial<Record<Stage, Partial<Plan["stages"][Stage]>>>,
  ) => void;
  initialMode?: Mode;
  initialStage?: Stage;
}) {
  const { data, error, mutate } = useSWR<History>(
    `/api/paid-media/assistant?clientId=${clientId}`,
    requestMedia,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [mode, setMode] = useState<Mode>(initialMode);
  const [stage, setStage] = useState<Stage>(initialStage ?? "ATR");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [issue, setIssue] = useState("");
  const [applied, setApplied] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);
  async function ask() {
    const prompt =
      question.trim() ||
      (mode === "generate"
        ? "Monte um plano AIDA a partir do briefing."
        : mode === "improve"
          ? "Sugira como aprimorar a ideia desta etapa."
          : "");
    if (!prompt || sending) return;
    setSending(true);
    setIssue("");
    try {
      const item = await requestMedia<PaidMediaExchange>(
        "/api/paid-media/assistant",
        {
          requestId: crypto.randomUUID(),
          clientId,
          question: prompt,
          period,
          mode,
          stage: mode === "improve" ? stage : undefined,
          draft: draft
            ? { ...draft, name: draft.name.trim() || "Rascunho da campanha" }
            : undefined,
        },
      );
      setReviewed((previous) => [...previous, item.id]);
      setQuestion("");
    } catch (cause) {
      setIssue(
        cause instanceof Error
          ? cause.message
          : "Não foi possível consultar o assistente.",
      );
    } finally {
      await mutate();
      setSending(false);
    }
  }
  return (
    <Card title="Assistente de tráfego pago">
      {error && <p role="alert">{error.message}</p>}
      {data && !data.configured && (
        <p>Assistente aguardando integração com o workflow de análise.</p>
      )}
      {data?.items.map((item) => (
        <article className="paid-row" key={item.id}>
          <div>
            <strong>
              {labels[item.mode as Mode] ?? item.mode}
              {item.stage ? ` · ${stageLabels[item.stage]}` : ""}
            </strong>
            <p className="preserve-lines">{item.question}</p>
            <p className="preserve-lines">
              {item.answer?.answer ??
                (item.status === "pending"
                  ? "Aguardando resposta"
                  : "Resposta indisponível")}
            </p>
            {onApply &&
              reviewed.includes(item.id) &&
              item.answer?.suggestions && (
                <details>
                  <summary>Revisar alterações sugeridas</summary>
                  {stages.map((s) => {
                    const suggestion = item.answer?.suggestions?.[s];
                    if (!suggestion) return null;
                    return (
                      <div key={s}>
                        <h4>{stageLabels[s]}</h4>
                        {suggestion.hypothesis !== undefined && (
                          <p>Hipótese · {suggestion.hypothesis}</p>
                        )}
                        {suggestion.creative !== undefined && (
                          <p>Briefing · {suggestion.creative}</p>
                        )}
                        {suggestion.destination !== undefined && (
                          <p>Destino · {suggestion.destination}</p>
                        )}
                        {suggestion.target !== undefined && (
                          <p>Indicador · {suggestion.target}</p>
                        )}
                        {suggestion.budgetCents !== undefined && (
                          <p>
                            Orçamento ·{" "}
                            {(suggestion.budgetCents / 100).toLocaleString(
                              "pt-BR",
                              { style: "currency", currency: "BRL" },
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={applied.includes(item.id)}
                    onClick={() => {
                      if (!item.answer?.suggestions) return;
                      onApply(item.answer.suggestions);
                      setApplied((previous) => [...previous, item.id]);
                    }}
                  >
                    {applied.includes(item.id)
                      ? "Aplicado ao rascunho"
                      : "Aplicar ao rascunho"}
                  </Button>
                </details>
              )}
          </div>
        </article>
      ))}
      {data?.configured && (
        <>
          {draft && (
            <label>
              Ação
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                disabled={sending}
              >
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "improve" && (
            <label>
              Etapa
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
                disabled={sending}
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {mode === "analyze" ? "Pergunta" : "Orientações para a sugestão"}
            <textarea
              value={question}
              maxLength={2500}
              disabled={sending}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <Button
            type="button"
            onClick={ask}
            disabled={sending || (mode === "analyze" && !question.trim())}
          >
            {sending ? "Consultando…" : labels[mode]}
          </Button>
        </>
      )}
      {issue && <p role="alert">{issue}</p>}
    </Card>
  );
}
