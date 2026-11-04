"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MessagesSquare } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Button } from "@/components/ui/button";
import { Badge, stageLabels } from "@/components/layout/shared";
import { LeadModal } from "@/features/queue/lead-modal";
import { assignedConversations } from "../services/assigned";
import {
  contactName,
  lastMessage,
  matchesSearch,
  messageTime,
  waitingFor,
  type QuickFilter,
} from "../services/presentation";
import { ContactAvatar } from "./avatar";
import { ChatPanel } from "./chat-panel";
import { ContextPanel } from "./context-panel";
import { ContextDrawer } from "./context-drawer";

export function Inbox() {
  const {
    repositories,
    scope,
    attendant,
    inboxLeadId,
    setClientId,
    inboxDrafts: drafts,
    setInboxDrafts: setDrafts,
  } = useDemo();
  const router = useRouter(),
    root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [quick, setQuick] = useState<QuickFilter>("all");
  const [filter, setFilter] = useState("all"),
    [operation, setOperation] = useState("all"),
    [doctor, setDoctor] = useState("all"),
    [stage, setStage] = useState("all");
  const [mobileChat, setMobileChat] = useState(Boolean(inboxLeadId)),
    [wide, setWide] = useState(false),
    [showContext, setShowContext] = useState(true),
    [drawer, setDrawer] = useState(false);
  const [openedLead, setOpenedLead] = useState<{
    id: string;
    clientId: string;
  } | null>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setWide(entries[0].contentRect.width >= 1120),
    );
    observer.observe(node);
    const measure = () => {
      const view = window.visualViewport;
      node.style.setProperty(
        "--inbox-height",
        `${Math.max(260, (view?.height ?? window.innerHeight) + (view?.offsetTop ?? 0) - node.getBoundingClientRect().top - 16)}px`,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);
  const clients = repositories.clients.list(scope);
  const all = assignedConversations(repositories, scope, attendant);
  const conversations = all
    .filter((c) => {
      const professional = c.client.doctors.find(
        (d) => d.id === c.lead.doctorId,
      );
      return (
        (filter === "all" || c.clientId === filter) &&
        (operation === "all" || c.client.vertical === operation) &&
        (doctor === "all" ||
          (doctor === "none"
            ? !c.lead.doctorId
            : `${c.clientId}:${c.lead.doctorId}` === doctor)) &&
        (stage === "all" || c.lead.stage === stage) &&
        (quick === "all" || waitingFor(c) === quick) &&
        matchesSearch(query, [
          contactName(c.lead, c),
          c.lead.contact?.phone,
          c.client.name,
          professional?.name,
          lastMessage(c)?.body,
        ])
      );
    })
    .sort((a, b) =>
      (lastMessage(b)?.at ?? b.lead.createdAt).localeCompare(
        lastMessage(a)?.at ?? a.lead.createdAt,
      ),
    );
  const conversation =
    conversations.find((c) => c.id === selected) ??
    conversations.find((c) => c.leadId === inboxLeadId) ??
    conversations[0];
  const activeFilters = [filter, operation, doctor, stage].filter(
    (v) => v !== "all",
  ).length;
  function clearFilters() {
    setQuery("");
    setQuick("all");
    setFilter("all");
    setOperation("all");
    setDoctor("all");
    setStage("all");
  }
  function editLead() {
    if (!conversation) return;
    setClientId(conversation.clientId);
    router.push(`/app/leads/${conversation.leadId}`);
  }
  const context = conversation ? (
    <ContextPanel
      key={conversation.id}
      client={conversation.client}
      lead={conversation.lead}
      conversation={conversation}
      appointments={repositories.appointments
        .list(conversation.clientId)
        .filter((a) => a.leadId === conversation.leadId)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))}
      onClose={() => {
        if (wide) setShowContext(false);
        else setDrawer(false);
      }}
      onOpenLead={() =>
        setOpenedLead({
          id: conversation.leadId,
          clientId: conversation.clientId,
        })
      }
      onEdit={editLead}
      onInsert={(text) =>
        setDrafts((previous) => ({
          ...previous,
          [conversation.id]: [previous[conversation.id], text]
            .filter(Boolean)
            .join("\n\n"),
        }))
      }
    />
  ) : null;
  return (
    <div className="inbox-page" ref={root}>
      <div className="inbox-page-heading">
        <div>
          <h1>Inbox</h1>
          <p>Seus atendimentos, em um só lugar.</p>
        </div>
        <span className="inbox-attendant">
          <span className="status-dot" />
          {attendant}
          <small>{all.length} conversas atribuídas</small>
        </span>
      </div>
      <div
        className="inbox-layout"
        data-chat={mobileChat && !!conversation}
        data-context={wide && showContext && !!conversation}
      >
        <section className="inbox-list-panel" aria-label="Conversas">
          <header className="inbox-list-header">
            <div>
              <h2>Conversas</h2>
              <Badge>{conversations.length}</Badge>
            </div>
            <label className="inbox-search">
              <Search size={17} />
              <span className="sr-only">Buscar conversa</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nome, telefone ou cliente"
              />
            </label>
            <div className="inbox-quick-filters" aria-label="Filtros rápidos">
              {(
                [
                  ["all", "Todas"],
                  ["reply", "Aguardando minha resposta"],
                  ["customer", "Aguardando cliente"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={quick === value}
                  onClick={() => setQuick(value)}
                >
                  {label}
                </button>
              ))}
              <button
                disabled
                title="A integração ainda não informa leitura de mensagens"
              >
                Não lidas
              </button>
              <button
                disabled
                title="Ainda não há estado de encerramento de conversa"
              >
                Finalizadas
              </button>
            </div>
            <details className="inbox-filters">
              <summary>
                <SlidersHorizontal size={14} />
                Filtros adicionais{" "}
                {activeFilters > 0 && <Badge>{activeFilters}</Badge>}
              </summary>
              <div>
                <label>
                  Filtrar cliente
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setDoctor("all");
                    }}
                  >
                    <option value="all">Todos os clientes</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operação
                  <select
                    value={operation}
                    onChange={(e) => {
                      setOperation(e.target.value);
                      setDoctor("all");
                    }}
                  >
                    <option value="all">Todas as operações</option>
                    <option value="healthcare">Prescrita</option>
                    <option value="legal">Veredite</option>
                  </select>
                </label>
                <label>
                  Profissional
                  <select
                    value={doctor}
                    onChange={(e) => setDoctor(e.target.value)}
                  >
                    <option value="all">Todos os profissionais</option>
                    <option value="none">Sem profissional vinculado</option>
                    {clients
                      .filter(
                        (c) =>
                          (filter === "all" || c.id === filter) &&
                          (operation === "all" || c.vertical === operation),
                      )
                      .flatMap((c) =>
                        c.doctors.map((d) => (
                          <option
                            key={`${c.id}:${d.id}`}
                            value={`${c.id}:${d.id}`}
                          >
                            {d.name} · {c.name}
                          </option>
                        )),
                      )}
                  </select>
                </label>
                <label>
                  Status do lead
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                  >
                    <option value="all">Todos os estágios</option>
                    {Object.entries(stageLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Atendente responsável
                  <select value={attendant} disabled>
                    <option>{attendant}</option>
                  </select>
                </label>
                <small>
                  Este Inbox exibe somente os seus atendimentos. Leitura e
                  encerramento dependem da integração.
                </small>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </div>
            </details>
          </header>
          <div
            className="inbox-conversation-scroll"
            tabIndex={0}
            aria-label="Lista de conversas"
          >
            {conversations.map((c) => {
              const last = lastMessage(c),
                professional = c.client.doctors.find(
                  (d) => d.id === c.lead.doctorId,
                );
              return (
                <button
                  className="inbox-conversation"
                  key={c.id}
                  aria-pressed={c.id === conversation?.id}
                  onClick={() => {
                    setSelected(c.id);
                    setMobileChat(true);
                  }}
                >
                  <ContactAvatar
                    name={contactName(c.lead, c)}
                    photoUrl={c.photoUrl}
                  />
                  <span className="inbox-conversation-content">
                    <span className="inbox-conversation-name">
                      <strong>{contactName(c.lead, c)}</strong>
                      {last && (
                        <time dateTime={last.at}>{messageTime(last.at)}</time>
                      )}
                    </span>
                    <span className="inbox-professional">
                      {professional?.name || "Sem profissional vinculado"}
                    </span>
                    <span
                      className="inbox-operation"
                      data-operation={c.client.vertical}
                    >
                      {c.client.name} ·{" "}
                      {c.client.vertical === "healthcare"
                        ? "Prescrita"
                        : "Veredite"}
                    </span>
                    <span className="inbox-message-preview">
                      {last?.body || "Nenhuma mensagem registrada"}
                    </span>
                    {waitingFor(c) === "reply" && (
                      <span className="inbox-reply-status">
                        Aguardando sua resposta
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!conversations.length && (
              <div className="inbox-list-empty">
                <MessagesSquare size={26} />
                <h3>
                  {all.length
                    ? "Nenhuma conversa encontrada"
                    : "Nenhum atendimento atribuído"}
                </h3>
                <p>
                  {all.length
                    ? "Ajuste os filtros para encontrar o contato."
                    : "Assuma um lead na fila de atendimento."}
                </p>
                {all.length > 0 && (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
        {conversation ? (
          <ChatPanel
            key={conversation.id}
            client={conversation.client}
            lead={conversation.lead}
            conversation={conversation}
            draft={drafts[conversation.id] ?? ""}
            onDraft={(text) =>
              setDrafts((previous) => ({
                ...previous,
                [conversation.id]: text,
              }))
            }
            onBack={() => setMobileChat(false)}
            contextOpen={wide ? showContext : drawer}
            onContext={() => {
              if (wide) setShowContext(!showContext);
              else setDrawer(true);
            }}
          />
        ) : (
          <section className="inbox-no-selection">
            <MessagesSquare size={36} />
            <h2>Seu próximo atendimento começa aqui</h2>
            <p>
              Selecione uma conversa para consultar o histórico e os dados do
              lead.
            </p>
          </section>
        )}
        {wide && showContext && conversation && (
          <aside
            className="inbox-context"
            aria-label="Informações e Assistente IA"
          >
            {context}
          </aside>
        )}
      </div>
      {!wide && drawer && conversation && (
        <ContextDrawer onClose={() => setDrawer(false)}>
          {context}
        </ContextDrawer>
      )}
      {openedLead && (
        <LeadModal
          clientId={openedLead.clientId}
          id={openedLead.id}
          onClose={() => setOpenedLead(null)}
          onConverse={() => {
            setOpenedLead(null);
            setDrawer(false);
            setMobileChat(true);
          }}
        />
      )}
    </div>
  );
}
export { Queue } from "@/features/queue/queue";
