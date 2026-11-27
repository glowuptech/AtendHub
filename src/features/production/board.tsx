"use client";
import { ProductionFiles } from "./files";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/layout/shared";
import { ScheduleDialog } from "@/features/appointments/components/weekly";
import { stages, stageLabels, type Stage } from "@/features/paid-media/model";
import { labels, workflow, type Task } from "./model";
import "./production.css";

type Plan = {
  id: string;
  name: string;
  objective: string;
  audience: string;
  stages: Partial<Record<Stage, { creative: string; hypothesis: string }>>;
};
type Board = {
  tasks: Task[];
  clients: { id: string; name: string }[];
  plans: Plan[];
  userId: string;
  canEdit: boolean;
  canCreate: boolean;
};
async function request(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Falha ao consultar a produção.");
  return body;
}
export function Production({
  fixedClient,
  initialClient,
  initialPlan,
  initialVida,
}: {
  fixedClient?: string;
  initialClient?: string;
  initialPlan?: string;
  initialVida?: Stage;
}) {
  const [client, setClient] = useState(fixedClient || initialClient || "");
  const [kind, setKind] = useState<Task["kind"]>("art");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(!!initialPlan);
  const [planId, setPlan] = useState(initialPlan || "");
  const [vida, setVida] = useState<Stage | "">(initialVida || "");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const path =
    "/api/production" +
    (client ? "?clientId=" + encodeURIComponent(client) : "");
  const { data, error, mutate } = useSWR<Board>(path, request, {
    refreshInterval: 30000,
  });
  const plan = data?.plans.find((p) => p.id === planId);
  const suggested = [
    plan?.objective,
    plan?.audience && "Público: " + plan.audience,
    vida && plan?.stages[vida]?.hypothesis,
    vida && plan?.stages[vida]?.creative,
  ]
    .filter(Boolean)
    .join("\n\n");
  async function write(method: string, body: object) {
    setBusy(true);
    setProblem("");
    try {
      await request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (method === "POST" || editing) {
        setCreating(false);
        setEditing(null);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      await mutate();
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await write(editing ? "PATCH" : "POST", {
      id: editing?.id ?? draftId,
      ...(editing ? { action: "edit", revision: editing.revision } : {}),
      kind,
      client_id: client,
      plan_id: planId || null,
      vida: vida || null,
      title: f.get("title"),
      brief: f.get("brief"),
      priority: f.get("priority"),
      review_on: f.get("review") || null,
      launch_on: f.get("launch") || null,
    });
  }
  if (error) return <p role="alert">{error.message}</p>;
  const tasks = data?.tasks.filter((t) => t.kind === kind) ?? [];
  return (
    <section className="production">
      {!fixedClient && (
        <Heading
          eyebrow="OPERAÇÃO"
          title="Produção"
          description="Demandas de campanhas por cliente e etapa."
        />
      )}
      <div className="toolbar">
        {!fixedClient && (
          <label>
            Cliente
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setPlan("");
              }}
            >
              <option value="">Todos os clientes</option>
              {data?.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(["art", "video"] as const).map((k) => (
          <Button
            key={k}
            aria-pressed={kind === k}
            variant={kind === k ? "default" : "outline"}
            onClick={() => setKind(k)}
          >
            {k === "art" ? "Arte gráfica" : "Vídeo"}
          </Button>
        ))}
        {data?.canCreate && (
          <Button
            onClick={() => {
              setDraftId(crypto.randomUUID());
              setEditing(null);
              setPlan("");
              setVida("");
              setProblem("");
              setCreating(true);
            }}
          >
            Nova demanda
          </Button>
        )}
      </div>
      {problem && !creating && <p role="alert">{problem}</p>}
      {!data ? (
        <p role="status">Carregando produção…</p>
      ) : (
        <div className="production-board">
          {workflow[kind].map((step) => {
            const items = tasks.filter((t) => t.stage === step);
            return (
              <section
                key={step}
                className="production-column"
                onDragOver={(e) => {
                  if (data.canEdit) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const task = tasks.find(
                    (t) => t.id === e.dataTransfer.getData("text/plain"),
                  );
                  if (data.canEdit && task && task.stage !== step && !busy)
                    void write("PATCH", {
                      id: task.id,
                      revision: task.revision,
                      action: "move",
                      stage: step,
                    });
                }}
              >
                <h3>
                  {labels[step]} <small>{items.length}</small>
                </h3>
                {items.map((t) => (
                  <article
                    key={t.id}
                    draggable={data.canEdit && !busy}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", t.id)
                    }
                  >
                    <small>
                      {data.clients.find((c) => c.id === t.client_id)?.name} ·{" "}
                      {
                        { normal: "Normal", high: "Alta", urgent: "Urgente" }[
                          t.priority
                        ]
                      }
                    </small>
                    <h4>{t.title}</h4>
                    <ProductionFiles task={t.id} client={t.client_id} edit={data.canEdit} review={t.stage === "review" || t.stage === "approval"} onReview={() => mutate()} />
                    {t.plan && <p>{t.plan.name}</p>}
                    {t.owner && <small>Responsável: {t.owner.display_name}</small>}
                    {t.vida && <p>{stageLabels[t.vida]}</p>}
                    {t.review_on && (
                      <p>
                        Revisão · {t.review_on.split("-").reverse().join("/")}
                      </p>
                    )}
                    {t.launch_on && (
                      <p>
                        Implementação ·{" "}
                        {t.launch_on.split("-").reverse().join("/")}
                      </p>
                    )}
                    {data.canEdit && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditing(t);
                          setClient(t.client_id);
                          setPlan(t.plan_id ?? "");
                          setVida(t.vida ?? "");
                          setProblem("");
                          setCreating(true);
                        }}
                      >
                        Editar demanda
                      </Button>
                    )}
                    {t.brief && (
                      <details>
                        <summary>Briefing</summary>
                        <p className="preserve-lines">{t.brief}</p>
                      </details>
                    )}
                    {data.canEdit && (
                      <label>
                        Etapa
                        <select
                          disabled={busy}
                          value={t.stage}
                          onChange={(e) =>
                            void write("PATCH", {
                              id: t.id,
                              revision: t.revision,
                              action: "move",
                              stage: e.target.value,
                            })
                          }
                        >
                          {workflow[kind].map((s) => (
                            <option key={s} value={s}>
                              {labels[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {data.canEdit &&
                    (!t.owner_id || t.owner_id === data.userId) ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void write("PATCH", {
                            id: t.id,
                            revision: t.revision,
                            action: t.owner_id ? "release" : "claim",
                          })
                        }
                      >
                        {t.owner_id ? "Liberar demanda" : "Assumir demanda"}
                      </Button>
                    ) : (
                      <small>
                        {t.owner_id ? "Atribuída" : "Sem responsável"}
                      </small>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {creating && ((editing ? data?.canEdit : data?.canCreate) || !data) && (
        <ScheduleDialog
          title={editing ? "Editar demanda" : "Nova demanda"}
          onClose={() => {
            if (!busy) {
              setCreating(false);
              setEditing(null);
            }
          }}
        >
          <form onSubmit={create}>
            <fieldset disabled={busy}>
              <label>
                Cliente
                <select
                  required
                  value={client}
                  disabled={!!fixedClient || !!editing}
                  onChange={(e) => {
                    setClient(e.target.value);
                    setPlan("");
                  }}
                >
                  <option value="">Selecione</option>
                  {data?.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Produção
                <select
                  disabled={!!editing}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Task["kind"])}
                >
                  <option value="art">Arte gráfica</option>
                  <option value="video">Vídeo</option>
                </select>
              </label>
              <label>
                Título
                <input
                  name="title"
                  defaultValue={editing?.title}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Planejamento
                <select
                  value={planId}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  <option value="">Sem vínculo</option>
                  {data?.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Etapa VIDA
                <select
                  value={vida}
                  onChange={(e) => setVida(e.target.value as Stage | "")}
                >
                  <option value="">Selecione</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Briefing
                <textarea
                  key={client + planId + vida + suggested}
                  name="brief"
                  defaultValue={editing?.brief ?? suggested}
                  maxLength={16000}
                />
              </label>
              <label>
                Prioridade
                <select name="priority" defaultValue={editing?.priority}>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
              <label>
                Entrega para revisão
                <input
                  type="date"
                  name="review"
                  defaultValue={editing?.review_on ?? ""}
                />
              </label>
              <label>
                Implementação prevista
                <input
                  type="date"
                  name="launch"
                  defaultValue={editing?.launch_on ?? ""}
                />
              </label>
              {problem && <p role="alert">{problem}</p>}
              <Button
                type="submit"
                disabled={editing ? !data?.canEdit : !data?.canCreate}
              >
                {editing ? "Salvar alterações" : "Criar demanda"}
              </Button>
            </fieldset>
          </form>
        </ScheduleDialog>
      )}
    </section>
  );
}
