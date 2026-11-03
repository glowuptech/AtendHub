"use client";
import { useState } from "react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Empty,
  dateTime,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
export function Inbox() {
  const { repositories, clientId } = useDemo();
  const [selected, setSelected] = useState(""),
    [owner, setOwner] = useState("all"),
    [notice, setNotice] = useState("");
  const conversations = repositories.inbox
    .list(clientId)
    .filter(
      (c) => owner === "all" || (owner === "unassigned" ? !c.owner : !!c.owner),
    );
  const conversation =
    conversations.find((c) => c.id === selected) ?? conversations[0];
  const client = repositories.clients.get(clientId);
  return (
    <>
      <Heading
        title="Conversas que acolhem."
        description={`${client.name} · atendimento humano, sem conexão WhatsApp.`}
      />
      <div className="toolbar">
        <label>
          Responsável
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">Todos</option>
            <option value="assigned">Operadora</option>
            <option value="unassigned">Não atribuído</option>
          </select>
        </label>
        <Badge tone="warning">Canal desconectado · simulação</Badge>
      </div>
      {!conversation ? (
        <Empty />
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
                <small>Olá! Gostaria de informações…</small>
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
            <span className="eyebrow">CONTEXTO DA CLÍNICA</span>
            <h2>{client.name}</h2>
            <Badge>Saúde</Badge>
            <p>Responsável: {conversation.owner ?? "Não atribuído"}</p>
            <NavButton href={`/app/leads/${conversation.leadId}`}>
              Abrir lead e campos
            </NavButton>
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
    </>
  );
}
export function Queue() {
  const { repositories, clientId, refresh } = useDemo();
  const [notice, setNotice] = useState("");
  const leads = repositories.leads.list(clientId);
  return (
    <>
      <Heading
        title="Fila de atendimento"
        description={`${repositories.clients.get(clientId).name} · atribuição simulada, sem roleta concorrente real.`}
      />
      <Card>
        {leads.map((l) => (
          <div className="field-row" key={l.id}>
            <div>
              <strong>{l.name}</strong>
              <small>
                {l.owner ?? "Aguardando responsável"} · {l.minutesSinceContact}{" "}
                minutos
              </small>
            </div>
            <Button
              disabled={!!l.owner}
              onClick={() => {
                try {
                  repositories.leads.claim(clientId, l.id);
                  refresh();
                  setNotice(
                    "Responsabilidade atribuída em memória à Operadora.",
                  );
                } catch {
                  setNotice("Este lead já possui responsável.");
                }
              }}
            >
              {l.owner ? "Já atribuído" : "Assumir · simulação"}
            </Button>
          </div>
        ))}
        <p role="status">{notice}</p>
      </Card>
    </>
  );
}
