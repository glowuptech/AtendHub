"use client";
import { useState } from "react";
import useSWR from "swr";
import { useDemo } from "@/components/layout/demo-context";
import { CadenceWorkspace } from "@/features/automation/pages";
import { Heading, dateTime, Badge } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";

type Reminder = {
  id: string;
  appointment_id: string;
  lead_name: string;
  professional: string;
  starts_at: string;
  sent_at: string | null;
  confirmed_at: string | null;
  dispatching: boolean;
  can_edit: boolean;
  is_eve: boolean;
  due_at?: string;
  slot?: number;
};
const endpoint = "/api/appointments/confirmations";
async function read(url: string): Promise<Reminder[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok)
    throw new Error((await res.json()).error || "Falha ao carregar lembretes.");
  return res.json();
}
export function ConfirmationsList({
  clientId,
  appointmentId,
  onChange,
}: {
  clientId: string;
  appointmentId?: string;
  onChange?: () => Promise<unknown>;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    endpoint + "?clientId=" + clientId,
    read,
    { refreshInterval: 15000 },
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function register(id: string, action: "sent" | "confirmed") {
    setProblem("");
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await onChange?.();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      await mutate();
      setBusy(false);
    }
  }
  return (
    <>
      {isLoading && <p role="status">Carregando consultas…</p>}
      {error && (
        <p role="alert">
          {error.message}{" "}
          <Button onClick={() => mutate()}>Tentar novamente</Button>
        </p>
      )}
      {problem && <p role="alert">{problem}</p>}
      {!appointmentId && data?.length === 0 && (
        <p>Nenhuma consulta futura com lembrete.</p>
      )}
      {data
        ?.filter((r) => !appointmentId || r.appointment_id === appointmentId)
        .map((r) => (
          <article key={r.id} className="automation-section">
            <h2>{appointmentId ? "Lembrete da consulta" : r.lead_name}</h2>
            {!appointmentId && (
              <p>
                {dateTime(r.starts_at)} · {r.professional}
              </p>
            )}
            {r.due_at && (
              <p>
                Lembrete {r.slot} · Envio a partir de {dateTime(r.due_at)}
              </p>
            )}
            <Badge>
              {r.confirmed_at
                ? "Paciente confirmou · lead qualificado"
                : r.sent_at
                  ? "Aguardando resposta"
                  : r.dispatching
                    ? "Aguardando retorno do envio"
                    : "Lembrete pendente"}
            </Badge>
            {r.can_edit && !r.confirmed_at && (
              <div className="actions">
                {!r.sent_at && !r.dispatching && r.is_eve && (
                  <Button
                    disabled={busy}
                    onClick={() => register(r.id, "sent")}
                  >
                    Registrar lembrete feito por telefone
                  </Button>
                )}
                {r.sent_at && (
                  <Button
                    disabled={busy}
                    onClick={() => register(r.id, "confirmed")}
                  >
                    Registrar que o paciente confirmou por telefone
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
    </>
  );
}
export function EveConfirmations() {
  const { clientId, authorizedClients, repositories, scope } = useDemo();
  const [showCadence, setShowCadence] = useState(false);
  const hasLegacyConfig = repositories.clients
    .list(scope)
    .some((c) => c.id === clientId);
  const client = authorizedClients.find((c) => c.id === clientId);
  return (
    <>
      <Heading
        title="Confirmações e lembretes"
        eyebrow="Workspace"
        description={client?.name || "Selecione um cliente no Workspace."}
      />
      {client && hasLegacyConfig && (
        <Button variant="outline" onClick={() => setShowCadence(!showCadence)}>
          {showCadence ? "Voltar às confirmações" : "Programação demonstrativa"}
        </Button>
      )}
      {client && showCadence && hasLegacyConfig ? (
        <CadenceWorkspace kind="reminder" />
      ) : (
        client && (
          <div key={client.id}>
            <ReminderPreferences clientId={client.id} />
            <ConfirmationsList clientId={client.id} />
          </div>
        )
      )}
    </>
  );
}

type Preferences = {
  advance: number;
  sameDay: number;
  count: 1 | 2;
  second: number;
  canEdit: boolean;
};

function ReminderPreferences({ clientId }: { clientId: string }) {
  const key = endpoint + "?settings&clientId=" + clientId;
  const { data, error, mutate } = useSWR<Preferences>(
    key,
    async (url: string) => {
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      return body;
    },
  );
  const [draft, setDraft] = useState<Preferences>();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const values = draft ?? data;
  if (error) return <p role="alert">{error.message}</p>;
  if (!values) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, clientId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await mutate(body, false);
      setDraft(undefined);
      setStatus("Configuração salva.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="automation-section">
      <summary>Configurar lembretes</summary>
      <form onSubmit={save}>
        <fieldset disabled={saving || !values.canEdit}>
          <label>
            Quantidade de lembretes por consulta
            <select
              value={values.count}
              onChange={(e) =>
                setDraft({ ...values, count: e.target.value === "2" ? 2 : 1 })
              }
            >
              <option value={1}>1 lembrete</option>
              <option value={2}>2 lembretes</option>
            </select>
          </label>
          <label>
            Marcada para outro dia · minutos de antecedência
            <input
              type="number"
              min={1}
              max={10080}
              required
              value={values.advance}
              onChange={(e) =>
                setDraft({ ...values, advance: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Marcada para hoje · minutos de antecedência
            <input
              type="number"
              min={1}
              max={1439}
              required
              value={values.sameDay}
              onChange={(e) =>
                setDraft({ ...values, sameDay: Number(e.target.value) })
              }
            />
          </label>
          {values.count === 2 && (
            <label>
              Segundo lembrete · minutos de antecedência
              <input
                type="number"
                min={1}
                max={1439}
                required
                value={values.second}
                onChange={(e) =>
                  setDraft({ ...values, second: Number(e.target.value) })
                }
              />
            </label>
          )}
          <p>
            Se a consulta for marcada dentro da janela, o primeiro lembrete fica
            disponível na próxima execução do n8n. O segundo depende do primeiro
            envio, tem intervalo mínimo de 30 minutos e só sai enquanto a
            consulta aguarda confirmação.
          </p>
          <Button type="submit">Salvar configuração</Button>
        </fieldset>
        {status && <p role="status">{status}</p>}
      </form>
    </details>
  );
}
