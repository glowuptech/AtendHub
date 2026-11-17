"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssignedInboxLead } from "../assigned-model";
export function StartConversation({
  lead,
  onStarted,
  onBack,
}: {
  lead: AssignedInboxLead;
  onBack: () => void;
  onStarted: (id: string) => void | Promise<void>;
}) {
  const ready = lead.connections.filter((c) => c.status === "connected");
  const [connectionId, setConnectionId] = useState(
    ready.length === 1
      ? ready[0].id
      : lead.connections.length === 1
        ? lead.connections[0].id
        : "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="inbox-no-selection">
      <Button variant="ghost" onClick={onBack}>
        Voltar aos atendimentos
      </Button>
      <h2>{lead.name}</h2>
      <p>
        {lead.clientName} · {lead.phone || "Telefone não informado"}
      </p>
      <p>Atendimento atribuído a você. Nenhuma mensagem foi trocada ainda.</p>
      {!lead.phone && (
        <p role="alert">Cadastre o telefone do lead para iniciar o contato.</p>
      )}
      {!lead.connections.length ? (
        <p role="status">
          Este cliente ainda não tem uma conexão WhatsApp disponível. Configure
          a conexão para iniciar o contato.
        </p>
      ) : (
        <>
          <label>
            Número comercial
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              disabled={busy}
            >
              <option value="">Selecione a conexão do cliente</option>
              {lead.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · +{c.phone}
                  {c.status !== "connected" ? " (não conectada)" : ""}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
          <Button
            disabled={busy || !connectionId || !lead.phone}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/inbox/conversations", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ leadId: lead.id, connectionId }),
                });
                const body = await response.json();
                if (!response.ok)
                  throw new Error(
                    body.error ?? "Não foi possível abrir a conversa.",
                  );
                await onStarted(body.id);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Não foi possível abrir a conversa.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Abrindo…" : "Abrir conversa"}
          </Button>
          <small>
            Abrir não envia mensagem. Você poderá escrever e enviar no chat; uma
            conexão ativa será necessária para o envio.
          </small>
        </>
      )}
    </section>
  );
}
