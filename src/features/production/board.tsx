"use client";
import { ProductionFiles, uploadReference } from "./files";
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
  const [opened, setOpened] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const [dragging, setDragging] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saved, setSaved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const detail = data?.tasks.find((t) => t.id === opened);
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
      if (!saved || method !== "POST")
        await request(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      if (method === "POST") {
        setSaved(true);
        let left = files;
        for (const file of files) {
          await uploadReference(draftId, client, file, (n) =>
            setUploadStatus(file.name + " · " + n + "%"),
          );
          left = left.slice(1);
          setFiles(left);
        }
        setSaved(false);
      }
      if (method === "POST" || editing) {
        setCreating(false);
        setEditing(null);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setUploadStatus("");
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
      reference_links: String(f.get("links") || "")
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
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
              setFiles([]);
              setSaved(false);
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
                data-stage={step}
                className={
                  "production-column" +
                  (dropTarget === step ? " drop-target" : "")
                }
                onDragOver={(e) => {
                  if (data.canEdit && dragging) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget(step);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget("");
                  setDragging("");
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
                {!items.length && (
                  <p className="drop-hint">Arraste demandas aqui</p>
                )}
                {items.map((t) => {
                  const owner = t.owner?.display_name?.trim();
                  return (
                    <button
                      type="button"
                      className="production-card"
                      key={t.id}
                      draggable={data.canEdit && !busy}
                      onClick={() => {
                        setProblem("");
                        setOpened(t.id);
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(t.id);
                      }}
                      onDragEnd={() => {
                        setDragging("");
                        setDropTarget("");
                      }}
                    >
                      <span className={"priority " + t.priority}>
                        {
                          { normal: "Normal", high: "Alta", urgent: "Urgente" }[
                            t.priority
                          ]
                        }
                      </span>
                      <strong>{t.title}</strong>
                      <small>
                        {data.clients.find((c) => c.id === t.client_id)?.name}
                      </small>
                      <span className={"kind " + kind}>
                        {kind === "art" ? "Arte gráfica" : "Edição de vídeo"}
                      </span>
                      {t.review_on && (
                        <small>
                          Entrega · {t.review_on.split("-").reverse().join("/")}
                        </small>
                      )}
                      {t.launch_on && (
                        <small>
                          Implementação ·{" "}
                          {t.launch_on.split("-").reverse().join("/")}
                        </small>
                      )}
                      {owner && (
                        <span
                          className="initials"
                          title={owner}
                          aria-label={"Responsável: " + owner}
                        >
                          {owner
                            .split(/\s+/)
                            .filter((_, i, a) => i === 0 || i === a.length - 1)
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      {detail &&
        data &&
        !creating &&
        (() => {
          const t = detail;
          return (
            <ScheduleDialog title={t.title} onClose={() => setOpened("")}>
              <div className="production-detail">
                <p>
                  {data.clients.find((c) => c.id === t.client_id)?.name} ·{" "}
                  {labels[t.stage]} ·{" "}
                  {t.owner?.display_name || "Sem responsável"}
                </p>
                {t.plan && <p>{t.plan.name}</p>}
                {t.vida && <p>{stageLabels[t.vida]}</p>}
                {t.reference_links?.length ? (
                  <section>
                    <h4>Links de referência</h4>
                    {t.reference_links.map((url, i) => (
                      <p key={i}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {url}
                        </a>
                      </p>
                    ))}
                  </section>
                ) : null}
                <ProductionFiles
                  task={t.id}
                  client={t.client_id}
                  edit={data.canEdit}
                  review={t.stage === "review" || t.stage === "approval"}
                  onReview={() => mutate()}
                />
                {data.canEdit && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOpened("");
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
                  <section>
                    <h4>Briefing</h4>
                    <p className="preserve-lines">{t.brief}</p>
                  </section>
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
                {data.canEdit && (!t.owner_id || t.owner_id === data.userId) ? (
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
                  <small>{t.owner_id ? "Atribuída" : "Sem responsável"}</small>
                )}
                {problem && <p role="alert">{problem}</p>}
              </div>
            </ScheduleDialog>
          );
        })()}
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
            <fieldset disabled={busy || saved}>
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
                Links de referência (um por linha)
                <textarea
                  name="links"
                  defaultValue={editing?.reference_links?.join("\n")}
                  placeholder="https://"
                />
              </label>
              {!editing && (
                <label>
                  Arquivos de referência
                  <input
                    type="file"
                    multiple
                    disabled={saved}
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                  {files.map((f, i) => (
                    <small key={i}>{f.name}</small>
                  ))}
                </label>
              )}
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
            </fieldset>
            {uploadStatus && <p role="status">{uploadStatus}</p>}
            {saved && (
              <p>Demanda criada. Os anexos restantes podem ser reenviados.</p>
            )}
            {problem && <p role="alert">{problem}</p>}
            <Button
              type="submit"
              disabled={busy || (editing ? !data?.canEdit : !data?.canCreate)}
            >
              {editing
                ? "Salvar alterações"
                : saved
                  ? "Reenviar anexos"
                  : "Criar demanda"}
            </Button>
          </form>
        </ScheduleDialog>
      )}
    </section>
  );
}
