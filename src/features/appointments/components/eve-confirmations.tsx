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
        <p>Nenhuma consulta futura com lembrete para hoje ou amanhã.</p>
      )}
      {data
        ?.filter((r) => !appointmentId || r.appointment_id === appointmentId)
        .map((r) => (
          <article key={r.id} className="automation-section">
            <h2>{appointmentId ? "Lembrete da véspera" : r.lead_name}</h2>
            {!appointmentId && (
              <p>
                {dateTime(r.starts_at)} · {r.professional}
              </p>
            )}
            <Badge>
              {r.confirmed_at
                ? "Paciente confirmou · lead qualificado"
                : r.sent_at
                  ? "Aguardando resposta"
                  : r.dispatching
                    ? "Aguardando retorno do envio"
                    : r.is_eve
                      ? "Lembrete da véspera pendente"
                      : "Sem envio registrado na véspera"}
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
        client && <ConfirmationsList key={client.id} clientId={client.id} />
      )}
    </>
  );
}
