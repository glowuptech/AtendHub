"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { stageLabels } from "@/components/layout/shared";
import type { InboxConversation } from "../model";

const url = "/api/inbox/episodes";
async function post(value: object): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok || !data.id)
    throw new Error(data.error || "Falha ao atualizar o atendimento.");
  return data.id;
}

export function EpisodeActions({
  conversation,
  onDone,
}: {
  conversation: InboxConversation;
  onDone: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef("");
  async function change(action: "new" | "resume" | "close") {
    setBusy(true);
    setError("");
    request.current ||= crypto.randomUUID();
    try {
      const id = await post({
        action,
        id: conversation.id,
        request: request.current,
      });
      await onDone(id);
      request.current = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na atualização.");
    } finally {
      setBusy(false);
    }
  }
  if (!conversation.mine) return null;
  return (
    <details>
      <summary>Atendimento</summary>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          change(conversation.status === "closed" ? "resume" : "close")
        }
      >
        {conversation.status === "closed"
          ? "Retomar atendimento"
          : "Encerrar atendimento"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => change("new")}
      >
        Novo atendimento
      </Button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

type Pending = {
  id: string;
  preview: string;
  occurred_at: string;
  candidates: {
    id: string;
    label: string;
    createdAt: string;
    client: string;
    stage: string;
  }[];
};
async function load(): Promise<Pending[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      (await response.json()).error || "Erro ao consultar pendências.",
    );
  return response.json();
}
export function RoutingReview({
  onDone,
}: {
  onDone: (id: string) => Promise<void>;
}) {
  const { data, error, mutate } = useSWR(url, load, { refreshInterval: 15000 });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function route(item: string, lead: string) {
    setBusy(true);
    setProblem("");
    try {
      const id = await post({ action: "route", item, lead });
      await mutate();
      await onDone(id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Erro ao vincular.");
      await mutate();
    } finally {
      setBusy(false);
    }
  }
  if (!error && !data?.length && !problem) return null;
  return (
    <details>
      <summary>
        Escolher atendimento {data?.length ? "(" + data.length + ")" : ""}
      </summary>
      {(error || problem) && <p role="alert">{problem || error.message}</p>}
      {data?.map((item) => (
        <section key={item.id}>
          <p>
            {item.preview || "Mensagem sem texto"} ·{" "}
            {new Date(item.occurred_at).toLocaleString("pt-BR")}
          </p>
          {item.candidates.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => route(item.id, c.id)}
            >
              {c.label} · {c.client} ·{" "}
              {stageLabels[c.stage as keyof typeof stageLabels] || c.stage} ·{" "}
              {new Date(c.createdAt).toLocaleString("pt-BR")}
            </Button>
          ))}
        </section>
      ))}
    </details>
  );
}
