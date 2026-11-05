"use client";
import { z } from "zod";
import { useState } from "react";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Badge,
  Empty,
  NavButton,
  dateTime,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { LeadPicker } from "@/features/appointments/components/lead-picker";
import {
  ruleDefinitions,
  variableNames,
  type Step,
  type Preferences,
} from "./config";
import type { Job } from "./engine";
const jobLabels = {
  scheduled: "Programado",
  blocked: "Bloqueado",
  queued: "Preparado (sem envio)",
  sent: "Enviado",
  cancelled: "Cancelado",
  failed: "Erro",
} as const;
export function Jobs({ clientId }: { clientId?: string }) {
  const { repositories, refresh } = useDemo();
  const [status, setStatus] = useState("all"),
    [client, setClient] = useState("all"),
    [kind, setKind] = useState("all");
  const all = repositories.automations.list(clientId),
    rows = all
      .filter(
        (j) =>
          (status === "all" || j.status === status) &&
          (client === "all" || j.clientId === client) &&
          (kind === "all" || j.kind === kind),
      )
      .sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  return (
    <section className="automation-section">
      <div className="section-caption">
        <div>
          <h2>Acompanhamento das execuções</h2>
          <p className="muted">
            Programação e motivos de bloqueio por contato e canal.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh}>
          <RefreshCw size={14} />
          Atualizar programação
        </Button>
      </div>
      <div className="automation-filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(jobLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rotina
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Todas</option>
            <option value="followup">Follow-up</option>
            <option value="reminder">Confirmações e lembretes</option>
          </select>
        </label>
        {!clientId && (
          <label>
            Cliente
            <select value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="all">Todos os clientes</option>
              {[...new Set(all.map((j) => j.clientId))].map((id) => (
                <option key={id} value={id}>
                  {repositories.clients.get(id).name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!rows.length ? (
        <Empty
          title="Nenhuma execução neste filtro"
          description="As tarefas aparecem quando uma rotina ativa encontra um contato ou agendamento elegível."
        />
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Execuções de automações"
        >
          <table>
            <thead>
              <tr>
                <th>Contato / Cliente</th>
                <th>Rotina / Canal</th>
                <th>Programação</th>
                <th>Status</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>
                      {repositories.leads.get(job.clientId, job.leadId).name}
                    </strong>
                    <small>{repositories.clients.get(job.clientId).name}</small>
                  </td>
                  <td>
                    {job.kind === "followup" ? "Follow-up" : "Agendamento"}
                    <small>
                      {job.channel === "whatsapp" ? "WhatsApp" : "SMS"} · etapa{" "}
                      {job.stepIndex + 1}
                    </small>
                  </td>
                  <td>{dateTime(job.dueAt)}</td>
                  <td>
                    <Badge
                      tone={
                        job.status === "failed"
                          ? "error"
                          : job.status === "blocked"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {jobLabels[job.status]}
                    </Badge>
                  </td>
                  <td>
                    <details>
                      <summary>Ver detalhes</summary>
                      <p>
                        {job.reason ||
                          "Programação válida nesta sessão; execução real depende do servidor/n8n."}
                      </p>
                      <p className="preserve-lines">{job.text}</p>
                      <small>
                        Versão {job.version} · ID {job.id}
                      </small>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function SystemAutomations() {
  const { repositories, refresh } = useDemo();
  const engine = repositories.automations;
  const [rules, setRules] = useState(() => engine.getRules()),
    [notice, setNotice] = useState("");
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Automações"
        description="Regras da fila e acompanhamento de todos os clientes autorizados."
        action={
          <NavButton href="/app/configuracoes">Configurar webhooks</NavButton>
        }
      />
      <p className="team-note">
        Regras executadas em memória. Disparos são preparados para integração;
        nenhuma mensagem é enviada externamente nesta etapa.
      </p>
      <form
        className="automation-section"
        onSubmit={(e) => {
          e.preventDefault();
          engine.saveRules(rules);
          refresh();
          setNotice("Regras salvas. Eventos anteriores não são reaplicados.");
        }}
      >
        <h2>Movimentação automática da fila</h2>
        <p className="muted">
          Cada regra preserva o responsável e só age sobre etapas elegíveis.
          Mensagens locais ou falhas de envio não movem os cards.
        </p>
        {ruleDefinitions.map((rule) => (
          <label className="automation-rule" key={rule.id}>
            <input
              type="checkbox"
              checked={rules[rule.id]}
              onChange={(e) =>
                setRules({ ...rules, [rule.id]: e.target.checked })
              }
            />
            <span>
              <strong>{rule.title}</strong>
              <small>{rule.description}</small>
            </span>
          </label>
        ))}
        <Button type="submit">
          <Save size={15} />
          Salvar regras
        </Button>
      </form>
      {notice && (
        <p role="status" className="team-note">
          {notice}
        </p>
      )}
      <Jobs />
      <section className="automation-section">
        <h2>Histórico de movimentações</h2>
        {engine.history().length ? (
          engine
            .history()
            .slice(-50)
            .reverse()
            .map((log) => (
              <div className="automation-log" key={log.id}>
                <strong>{log.message}</strong>
                <small>
                  {repositories.clients.get(log.clientId).name} ·{" "}
                  {repositories.leads.get(log.clientId, log.leadId).name} ·{" "}
                  {dateTime(log.at)}
                </small>
              </div>
            ))
        ) : (
          <p className="muted">Nenhuma movimentação automática registrada.</p>
        )}
      </section>
    </>
  );
}
export function CadenceWorkspace({ kind }: { kind: Job["kind"] }) {
  const { clientId } = useDemo();
  return <CadencePage key={`${clientId}:${kind}`} kind={kind} />;
}
function CadencePage({ kind }: { kind: Job["kind"] }) {
  const { repositories, clientId, webhookConfig, refresh, calendar } =
      useDemo(),
    engine = repositories.automations,
    client = repositories.clients.get(clientId);
  const [draft, setDraft] = useState(
      () => engine.getConfig(clientId, kind).value,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [leadId, setLeadId] = useState("");
  const [units, setUnits] = useState<Record<string, string>>({});
  const factor = (step: Step) =>
    units[step.id] === "days"
      ? 1440
      : units[step.id] === "hours"
        ? 60
        : units[step.id] === "minutes"
          ? 1
          : step.minutes % 1440 === 0
            ? 1440
            : step.minutes % 60 === 0
              ? 60
              : 1;
  const title = kind === "followup" ? "Follow-up" : "Confirmações e lembretes";
  const url =
    kind === "followup" ? webhookConfig.followups : webhookConfig.reminders;
  function patch(id: string, change: Partial<Step>) {
    setDraft({
      ...draft,
      steps: draft.steps.map((s) => (s.id === id ? { ...s, ...change } : s)),
    });
  }
  return (
    <>
      <Heading
        title={title}
        eyebrow="WORKSPACE"
        description={`${client.name} · mensagens e programação deste cliente.`}
      />
      <p className="team-note">
        {url
          ? "URL cadastrada, ainda sem execução externa."
          : "Configure o destino de webhook desta rotina em Configurações → Webhooks."}{" "}
        Dados e programação permanecem em memória.
      </p>
      <form
        className="automation-section"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          try {
            engine.saveConfig(clientId, kind, draft);
            refresh();
            setError("");
            setNotice(
              "Rotina salva para este cliente. Programação revalidada.",
            );
          } catch (e) {
            setError(
              e instanceof z.ZodError
                ? e.issues[0].message
                : e instanceof Error
                  ? e.message
                  : "Confira a configuração.",
            );
          }
        }}
      >
        <div className="section-caption">
          <h2>Configurar rotina</h2>
          <Badge>Versão {engine.getConfig(clientId, kind).version}</Badge>
        </div>
        <label className="check-option">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Habilitar esta rotina
        </label>
        <label className="check-option">
          <input
            type="checkbox"
            checked={draft.businessHours}
            onChange={(e) =>
              setDraft({ ...draft, businessHours: e.target.checked })
            }
          />
          Respeitar expediente, dias úteis e feriados
        </label>
        {draft.businessHours && (
          <div className="automation-window">
            <label className="check-option">
              <input
                type="checkbox"
                checked={!!draft.window}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    window: e.target.checked
                      ? structuredClone(calendar)
                      : undefined,
                  })
                }
              />
              Definir expediente próprio desta rotina
            </label>
            {draft.window ? (
              <>
                <div className="form-columns">
                  <label>
                    Início dos envios
                    <input
                      type="time"
                      value={draft.window.start}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          window: { ...draft.window!, start: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Fim dos envios
                    <input
                      type="time"
                      value={draft.window.end}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          window: { ...draft.window!, end: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="automation-weekdays">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                    (day, index) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={draft.window!.days.includes(index)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              window: {
                                ...draft.window!,
                                days: e.target.checked
                                  ? [...draft.window!.days, index]
                                  : draft.window!.days.filter(
                                      (d) => d !== index,
                                    ),
                              },
                            })
                          }
                        />
                        {day}
                      </label>
                    ),
                  )}
                </div>
                <label>
                  Feriados desta rotina (AAAA-MM-DD, um por linha)
                  <textarea
                    value={draft.window.holidays.join("\n")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        window: {
                          ...draft.window!,
                          holidays: e.target.value.split(/\s+/).filter(Boolean),
                        },
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <small>
                Usa o calendário geral de atendimento. Você pode personalizar
                uma janela para este cliente e rotina.
              </small>
            )}
          </div>
        )}
        <p className="muted">
          {kind === "followup"
            ? "A primeira etapa começa após a última mensagem efetivamente enviada pela atendente. As seguintes aguardam o resultado da etapa anterior. Resposta, agendamento, pausa ou recusa interrompem a sequência."
            : "Cada etapa é calculada antes do horário da consulta. Confirmar cancela pedidos de confirmação pendentes; reagendamento e comparecimento invalidam os envios incompatíveis."}
        </p>
        <p className="automation-variables">
          Variáveis disponíveis:{" "}
          {(kind === "followup"
            ? variableNames.slice(0, 3)
            : variableNames
          ).map((v) => (
            <code key={v}>{`{${v}}`}</code>
          ))}
        </p>
        {draft.steps.map((step, index) => (
          <fieldset className="automation-step" key={step.id}>
            <legend>Etapa {index + 1}</legend>
            <div className="section-caption">
              <label>
                {kind === "followup"
                  ? index === 0
                    ? "Intervalo após a última mensagem"
                    : "Intervalo após a etapa anterior"
                  : "Antecedência do agendamento"}
                <input
                  type="number"
                  min={factor(step) === 1 ? 1 : 0.25}
                  max={43200 / factor(step)}
                  step={factor(step) === 1 ? 1 : 0.25}
                  value={step.minutes / factor(step)}
                  onChange={(e) => {
                    const f = factor(step);
                    setUnits((previous) => ({
                      ...previous,
                      [step.id]:
                        f === 1440 ? "days" : f === 60 ? "hours" : "minutes",
                    }));
                    patch(step.id, { minutes: Number(e.target.value) * f });
                  }}
                />
              </label>
              <label>
                Unidade de tempo da etapa {index + 1}
                <select
                  value={
                    factor(step) === 1440
                      ? "days"
                      : factor(step) === 60
                        ? "hours"
                        : "minutes"
                  }
                  onChange={(e) =>
                    setUnits({ ...units, [step.id]: e.target.value })
                  }
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Dias</option>
                </select>
              </label>
              {kind === "reminder" && (
                <label>
                  Finalidade
                  <select
                    value={step.purpose}
                    onChange={(e) =>
                      patch(step.id, {
                        purpose: e.target.value as Step["purpose"],
                      })
                    }
                  >
                    <option value="confirmation">Pedir confirmação</option>
                    <option value="reminder">Lembrar o agendamento</option>
                  </select>
                </label>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover etapa ${index + 1}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.filter((s) => s.id !== step.id),
                  })
                }
              >
                <Trash2 size={15} />
              </Button>
            </div>
            <small>
              {step.minutes >= 60
                ? `${(step.minutes / 60).toLocaleString("pt-BR")} horas`
                : "Configure o intervalo em minutos."}
            </small>
            <div className="form-columns">
              {(["whatsapp", "sms"] as const).map((channel) => (
                <div key={channel}>
                  <label className="check-option">
                    <input
                      type="checkbox"
                      checked={step[channel]}
                      onChange={(e) =>
                        patch(step.id, { [channel]: e.target.checked })
                      }
                    />
                    {channel === "whatsapp" ? "WhatsApp" : "SMS"}
                  </label>
                  <label>
                    Mensagem {channel === "whatsapp" ? "WhatsApp" : "SMS"}
                    <textarea
                      rows={4}
                      disabled={!step[channel]}
                      maxLength={channel === "sms" ? 480 : 2000}
                      value={
                        channel === "whatsapp"
                          ? step.whatsappText
                          : step.smsText
                      }
                      onChange={(e) =>
                        patch(step.id, {
                          [channel === "whatsapp" ? "whatsappText" : "smsText"]:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.steps.length >= 10}
          onClick={() =>
            setDraft({
              ...draft,
              steps: [
                ...draft.steps,
                {
                  id: crypto.randomUUID(),
                  minutes: kind === "followup" ? 360 : 1440,
                  purpose: kind === "followup" ? "followup" : "confirmation",
                  whatsapp: true,
                  sms: false,
                  whatsappText: "",
                  smsText: "",
                },
              ],
            })
          }
        >
          <Plus size={15} />
          Adicionar etapa
        </Button>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="actions automation-save">
          <Button type="submit">Salvar rotina</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(engine.getConfig(clientId, kind).value);
              setError("");
              setNotice("Alterações descartadas.");
            }}
          >
            Descartar alterações
          </Button>
        </div>
      </form>
      {notice && (
        <p role="status" className="team-note">
          {notice}
        </p>
      )}
      <details className="automation-section">
        <summary>Preferências de contato e pausa por lead</summary>
        <p>
          Registre quais canais o contato aceita e a origem da preferência.
          Nenhum canal é autorizado automaticamente.
        </p>
        <LeadPicker
          leads={repositories.leads.list(clientId)}
          appointments={repositories.appointments.list(clientId)}
          clientId={clientId}
          value={leadId}
          onChange={setLeadId}
        />
        {leadId && (
          <PreferencesEditor
            key={`${clientId}:${leadId}`}
            clientId={clientId}
            leadId={leadId}
          />
        )}
      </details>
      <Jobs clientId={clientId} />
    </>
  );
}
function PreferencesEditor({
  clientId,
  leadId,
}: {
  clientId: string;
  leadId: string;
}) {
  const { repositories, refresh } = useDemo(),
    engine = repositories.automations;
  const [value, setValue] = useState<Preferences>(() =>
      engine.getPreferences(clientId, leadId),
    ),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="automation-preferences"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          engine.setPreferences(clientId, leadId, value);
          refresh();
          setError("");
          setNotice("Preferências salvas. Tarefas revalidadas.");
        } catch (e) {
          setError(
            e instanceof z.ZodError
              ? e.issues[0].message
              : e instanceof Error
                ? e.message
                : "Confira os dados.",
          );
        }
      }}
    >
      <h3>{repositories.leads.get(clientId, leadId).name}</h3>
      {(
        [
          ["whatsapp", "Permitir WhatsApp"],
          ["sms", "Permitir SMS"],
          ["paused", "Pausar automações deste lead"],
          ["optOut", "Contato não deseja receber automações"],
        ] as const
      ).map(([key, label]) => (
        <label className="check-option" key={key}>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(e) => setValue({ ...value, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <label>
        Origem da preferência / autorização
        <input
          maxLength={300}
          value={value.source}
          onChange={(e) => setValue({ ...value, source: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline">
        Salvar preferências
      </Button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
