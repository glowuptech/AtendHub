"use client";
import { assignedConversations } from "../services/assigned";
import { LeadModal } from "@/features/queue/lead-modal";
import { useState } from "react";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Badge, Empty, dateTime } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
export function Inbox() {
  const { repositories, scope, attendant, inboxLeadId } = useDemo();
  const [openedLead, setOpenedLead] = useState<{
    id: string;
    clientId: string;
  } | null>(null);
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("all"),
    [notice, setNotice] = useState("");
  const clients = repositories.clients.list(scope);
  const conversations = assignedConversations(
    repositories,
    scope,
    attendant,
  ).filter((c) => filter === "all" || c.clientId === filter);
  const conversation =
    conversations.find((c) => c.id === selected) ??
    conversations.find((c) => c.leadId === inboxLeadId) ??
    conversations[0];
  const client = conversation?.client;
  return (
    <>
      <Heading
        title="Inbox"
        eyebrow="SISTEMA"
        description="Seus atendimentos de todos os clientes e operações."
      />
      <div className="toolbar">
        <label>
          Filtrar cliente
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Badge tone="warning">Canal desconectado · simulação</Badge>
      </div>
      {!conversation || !client ? (
        <Empty
          title="Nenhum atendimento atribuído"
          description="Assuma um lead na fila de atendimento para encontrá-lo no seu Inbox."
        />
      ) : (
        <div className="inbox">
          <section className="conversation-list" aria-label="Conversas">
            <h2>
              Inbox <Badge>{conversations.length}</Badge>
            </h2>
            {conversations.map((c) => (
              <button
                key={c.id}
                className={c.id === conversation.id ? "selected" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setNotice("");
                }}
              >
                <strong>{c.name}</strong>
                <small>
                  {c.client.name} ·{" "}
                  {c.client.vertical === "healthcare"
                    ? "Prescrita"
                    : "Veredite"}
                </small>
                <small>
                  {c.messages.at(-1)?.body || "Sem mensagens ainda"}
                </small>
                <span>{c.owner ?? "Sem responsável"}</span>
              </button>
            ))}
          </section>
          <section className="thread">
            <header>
              <strong>{conversation.name}</strong>
              <small>{client.name} · mensagens </small>
            </header>
            <div className="messages">
              {!conversation.messages.length && (
                <p>Nenhuma mensagem registrada para este contato.</p>
              )}
              {conversation.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.direction}`}>
                  <p>{m.body}</p>
                  <small>{dateTime(m.at)} · simulado</small>
                </div>
              ))}
            </div>
            <div className="composer">
              <p>Envio real indisponível em C1.</p>
              <Button
                onClick={() =>
                  setNotice(
                    "Exemplo de resposta administrativa exibido. Nenhuma mensagem foi enviada.",
                  )
                }
              >
                Demonstrar resposta
              </Button>
              <p role="status">{notice}</p>
            </div>
          </section>
          <aside className="conversation-context">
            <span className="eyebrow">CONTEXTO DO CLIENTE</span>
            <h2>{client.name}</h2>
            <Badge>
              {client.vertical === "healthcare"
                ? "Prescrita · Saúde"
                : "Veredite · Jurídico"}
            </Badge>
            <p>Responsável: {conversation.owner ?? "Não atribuído"}</p>
            <Button
              variant="outline"
              onClick={() =>
                setOpenedLead({
                  id: conversation.leadId,
                  clientId: conversation.clientId,
                })
              }
            >
              Abrir lead e campos
            </Button>
            <hr />
            <h3>Agendamento externo</h3>
            <p>
              A agenda da clínica é a fonte oficial. Este link é somente uma
              prévia.
            </p>
            <a
              href={client.externalSchedulingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir agenda ↗
            </a>
          </aside>
        </div>
      )}
      {openedLead && (
        <LeadModal
          clientId={openedLead.clientId}
          id={openedLead.id}
          onClose={() => setOpenedLead(null)}
          onConverse={() => setOpenedLead(null)}
        />
      )}
    </>
  );
}
export { Queue } from "@/features/queue/queue";
