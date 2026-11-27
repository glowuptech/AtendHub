"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Badge, Card, Heading, NavButton } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { localDay, RangeSchema } from "@/lib/date-range";
import {
  emptyPlan,
  stageGuide,
  stageLabels,
  stageMetric,
  stages,
  type MediaReport,
  type Plan,
  type Stage,
} from "./model";
import { money } from "./workspace";
import { endpoint, requestMedia } from "./transport";
import { MediaAssistant } from "./assistant";

type Changes = Partial<Plan["stages"][Stage]>;
type DisplayClient = { id: string; name: string };

export function CampaignPlanning({
  initialClient,
}: {
  initialClient?: string;
}) {
  const [today] = useState(() => localDay(new Date().toISOString()));
  const { data, error, isLoading } = useSWR<MediaReport>(
    `${endpoint}?from=${today}&to=${today}`,
    requestMedia,
    { revalidateOnFocus: false },
  );
  const [selected, setSelected] = useState(initialClient ?? "");
  const client =
    data?.clients.find((c) => c.id === selected) ?? data?.clients[0];
  return (
    <div className="paid-workspace">
      <Heading
        eyebrow="SISTEMA"
        title="Planejamento de campanhas"
        description="Planeje as quatro etapas do Método VIDA e vincule as campanhas que entraram no ar."
        action={
          <NavButton href="/app/trafego-pago">Ver tráfego pago</NavButton>
        }
      />
      {isLoading && <p role="status">Carregando clientes…</p>}
      {error && (
        <Card>
          <p role="alert">{error.message}</p>
        </Card>
      )}
      {data &&
        !error &&
        (client ? (
          <>
            <Card>
              <label>
                Cliente
                <select
                  value={client.id}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
            <ClientPlanning
              key={client.id}
              client={client}
              canEdit={data.canManage}
              today={today}
            />
          </>
        ) : (
          <Card>
            <p>Nenhum cliente autorizado disponível.</p>
          </Card>
        ))}
    </div>
  );
}

function ClientPlanning({
  client,
  canEdit,
  today,
}: {
  client: DisplayClient;
  canEdit: boolean;
  today: string;
}) {
  const key = `${endpoint}?kind=plans&clientId=${client.id}`;
  const { data, error, isLoading, mutate } = useSWR<Plan[]>(key, requestMedia, {
    revalidateOnFocus: false,
  });
  const [selection, setSelection] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const selected = data?.find((p) => p.id === selection);
  const visible =
    data?.filter((p) => showArchived || p.status !== "archived") ?? [];
  return (
    <>
      <Card title="Planos do cliente">
        <label>
          Plano
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">
              {canEdit ? "Novo plano" : "Selecione um plano"}
            </option>
            {visible.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {statusLabel[plan.status]}
              </option>
            ))}
          </select>
        </label>
        <label className="paid-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              if (!e.target.checked && selected?.status === "archived")
                setSelection("");
            }}
          />
          Mostrar arquivados
        </label>
        {isLoading && <p role="status">Carregando planos…</p>}
        {error && <p role="alert">{error.message}</p>}
      </Card>
      {data && (!selection || selected) && (canEdit || selected) && (
        <PlanEditor
          key={selection || "new"}
          initial={selected ?? emptyPlan(client.id, today)}
          canEdit={canEdit}
          onSave={async (p) => {
            const saved = await requestMedia<Plan>(endpoint, {
              action: "plan",
              plan: p,
            });
            await mutate(
              (rows) => [
                saved,
                ...(rows ?? []).filter((row) => row.id !== saved.id),
              ],
              { revalidate: false },
            );
            setSelection(
              saved.status === "archived" && !showArchived ? "" : saved.id!,
            );
            return saved;
          }}
        />
      )}
    </>
  );
}

const statusLabel = {
  draft: "Rascunho",
  approved: "Aprovado",
  archived: "Arquivado",
} as const;

function PlanEditor({
  initial,
  canEdit,
  onSave,
}: {
  initial: Plan;
  canEdit: boolean;
  onSave: (plan: Plan) => Promise<Plan>;
}) {
  const [plan, setPlan] = useState(initial);
  const [pending, setPending] = useState(false);
  const [assist, setAssist] = useState<"plan" | Stage | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resultDates, setResultDates] = useState<{
    from: string;
    to: string;
  } | null>(initial.id ? { from: initial.from, to: initial.to } : null);
  const query =
    resultDates &&
    new URLSearchParams({ ...resultDates, clientId: plan.clientId });
  const report = useSWR<MediaReport>(
    query ? `${endpoint}?${query}` : null,
    requestMedia,
    { revalidateOnFocus: false },
  );
  const [today] = useState(() => localDay(new Date().toISOString()));
  const catalog = useSWR<MediaReport>(
    canEdit
      ? `${endpoint}?from=${today}&to=${today}&clientId=${plan.clientId}`
      : null,
    requestMedia,
    { revalidateOnFocus: false },
  );
  const campaigns = catalog.data?.campaigns ?? report.data?.campaigns ?? [];
  function patch(stage: Stage, change: Changes) {
    setPlan((previous) => ({
      ...previous,
      stages: {
        ...previous.stages,
        [stage]: { ...previous.stages[stage], ...change },
      },
    }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canEdit) return;
    const period = RangeSchema.safeParse(plan);
    if (!period.success) {
      setError(period.error.issues[0]?.message ?? "Confira as datas.");
      return;
    }
    setPending(true);
    setNotice("");
    setError("");
    try {
      const next = await onSave(plan);
      setPlan(next);
      setResultDates({ from: next.from, to: next.to });
      setNotice("Plano salvo.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o plano.",
      );
    } finally {
      setPending(false);
    }
  }
  function showAssistant(stage: Stage | "plan") {
    setAssist((before) => (before === stage ? null : stage));
  }
  function renderAssistant(stage?: Stage) {
    return (
      <MediaAssistant
        key={stage ?? "plan"}
        clientId={plan.clientId}
        period={{ from: plan.from, to: plan.to }}
        draft={plan}
        initialMode={stage ? "improve" : "generate"}
        initialStage={stage}
        onApply={(suggestions) =>
          setPlan((previous) => {
            const updated = { ...previous.stages };
            for (const s of stages)
              if (suggestions[s])
                updated[s] = { ...updated[s], ...suggestions[s] };
            return { ...previous, stages: updated };
          })
        }
      />
    );
  }
  const budget = stages.reduce(
    (sum, stage) => sum + plan.stages[stage].budgetCents,
    0,
  );
  return (
    <form onSubmit={save} className="paid-workspace">
      <Card title={plan.id ? plan.name : "Novo planejamento"}>
        <fieldset disabled={!canEdit || pending}>
          <label>
            Nome do plano
            <input
              value={plan.name}
              minLength={2}
              maxLength={150}
              required
              onChange={(e) => setPlan({ ...plan, name: e.target.value })}
            />
          </label>
          <div className="paid-filter">
            <label>
              Início
              <input
                type="date"
                value={plan.from}
                required
                onChange={(e) => setPlan({ ...plan, from: e.target.value })}
              />
            </label>
            <label>
              Fim
              <input
                type="date"
                value={plan.to}
                required
                onChange={(e) => setPlan({ ...plan, to: e.target.value })}
              />
            </label>
            <label>
              Estado
              <select
                value={plan.status}
                onChange={(e) =>
                  setPlan({ ...plan, status: e.target.value as Plan["status"] })
                }
              >
                {Object.entries(statusLabel).map(([status, label]) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Serviço
            <input
              value={plan.service}
              maxLength={300}
              onChange={(e) => setPlan({ ...plan, service: e.target.value })}
            />
          </label>
          <label>
            Objetivo
            <textarea
              value={plan.objective}
              maxLength={2000}
              onChange={(e) => setPlan({ ...plan, objective: e.target.value })}
            />
          </label>
          <label>
            Público
            <textarea
              value={plan.audience}
              maxLength={2000}
              onChange={(e) => setPlan({ ...plan, audience: e.target.value })}
            />
          </label>
        </fieldset>
        <p>
          Orçamento total previsto <strong>{money(budget / 100, "BRL")}</strong>
        </p>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            aria-expanded={assist === "plan"}
            onClick={() => showAssistant("plan")}
          >
            Gerar plano completo
          </Button>
        )}
        {assist === "plan" && renderAssistant()}
      </Card>
      {stages.map((stage) => {
        const value = plan.stages[stage];
        const linked = new Set(value.campaignIds);
        const live =
          report.data?.campaigns.filter((c) => linked.has(c.campaign_id)) ?? [];
        const sums = new Map<string, number>();
        live.forEach((row) => {
          if (
            report.data?.accounts.find((a) => a.account_id === row.account_id)
              ?.coveredDays
          )
            sums.set(
              row.currency,
              (sums.get(row.currency) ?? 0) + row.metrics.spend,
            );
        });
        const missing = value.campaignIds.filter(
          (id) => !campaigns.some((c) => c.campaign_id === id),
        );
        return (
          <Card key={stage}>
            <details open={stage === "ATR" ? true : undefined}>
              <summary>
                <strong>{stageLabels[stage]}</strong> ·{" "}
                {money(value.budgetCents / 100, "BRL")} ·{" "}
                {value.campaignIds.length} campanha(s)
              </summary>
              <p>{stageGuide[stage]}</p>
              {plan.id && <NavButton href={`/app/producao?clientId=${plan.clientId}&planId=${plan.id}&vida=${stage}`}>Criar demanda</NavButton>}
              <fieldset
                disabled={!canEdit || pending}
                className="paid-stage-editor"
              >
                <div className="paid-filter">
                  <label>
                    Orçamento previsto em R$
                    <input
                      type="number"
                      min={0}
                      max={1000000000}
                      step="0.01"
                      value={value.budgetCents / 100}
                      onChange={(e) =>
                        patch(stage, {
                          budgetCents: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </label>
                  <label>
                    Indicador de sucesso
                    <input
                      value={value.target}
                      maxLength={500}
                      placeholder={stageMetric[stage]}
                      onChange={(e) => patch(stage, { target: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Hipótese
                  <textarea
                    value={value.hypothesis}
                    maxLength={2500}
                    onChange={(e) =>
                      patch(stage, { hypothesis: e.target.value })
                    }
                  />
                </label>
                <label>
                  Briefing do criativo
                  <textarea
                    value={value.creative}
                    maxLength={3500}
                    onChange={(e) => patch(stage, { creative: e.target.value })}
                  />
                </label>
                <label>
                  Destino
                  <input
                    value={value.destination}
                    maxLength={500}
                    placeholder="Perfil, formulário ou WhatsApp"
                    onChange={(e) =>
                      patch(stage, { destination: e.target.value })
                    }
                  />
                </label>
                <label>
                  Campanhas vinculadas
                  <select
                    multiple
                    value={value.campaignIds}
                    onChange={(e) =>
                      patch(stage, {
                        campaignIds: Array.from(
                          e.currentTarget.selectedOptions,
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {campaigns.map((c) => (
                      <option key={c.campaign_id} value={c.campaign_id}>
                        {c.name} ·{" "}
                        {c.stage ? stageLabels[c.stage] : "Sem etapa"}
                      </option>
                    ))}
                    {missing.map((id) => (
                      <option key={id} value={id}>
                        Campanha {id} indisponível
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Use Ctrl ou ⌘ para selecionar mais de uma campanha.
                </p>
              </fieldset>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={assist === stage}
                  onClick={() => showAssistant(stage)}
                >
                  Aprimorar ideia
                </Button>
              )}
              {assist === stage && renderAssistant(stage)}
              {resultDates && !!value.campaignIds.length && (
                <div className="paid-row">
                  <Badge>Realizado · período salvo</Badge>
                  {sums.size ? (
                    [...sums].map(([currency, spend]) => (
                      <strong key={currency}>{money(spend, currency)}</strong>
                    ))
                  ) : (
                    <span>Sem importação no período.</span>
                  )}
                </div>
              )}
            </details>
          </Card>
        );
      })}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {canEdit && (
        <div>
          <Button disabled={pending} type="submit">
            {pending ? "Salvando…" : "Salvar plano"}
          </Button>
        </div>
      )}
    </form>
  );
}
