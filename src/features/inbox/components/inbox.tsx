"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, stageLabels } from "@/components/layout/shared";
import type { Shortcut } from "./chat-shortcuts";
import { RoutingReview } from "./episode-actions";
import { StartConversation } from "./start-conversation";
import { useAssignedInboxLeads } from "../hooks";
import { useInboxConversations } from "../hooks";
import {
  matchesQuick,
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
  const root = useRef<HTMLDivElement>(null);
  const { data, error, isLoading, mutate } = useInboxConversations();
  const {
    data: assigned = [],
    error: assignedError,
    mutate: mutateAssigned,
  } = useAssignedInboxLeads();
  const [selectedLead, setSelectedLead] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("leadId") ?? "")
      : "",
  );
  const [chatAction, setChatAction] = useState<{
    conversationId: string;
    kind: Shortcut;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [quick, setQuick] = useState<QuickFilter>(selectedLead ? "all" : "open");
  const [client, setClient] = useState("all"),
    [operation, setOperation] = useState("all"),
    [connection, setConnection] = useState("all"),
    [stage, setStage] = useState("all");
  const [mobileChat, setMobileChat] = useState(false),
    [wide, setWide] = useState(false),
    [showContext, setShowContext] = useState(true),
    [drawer, setDrawer] = useState(false);
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
  const all = useMemo(() => data ?? [], [data]);
  const repeatedContacts = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const row of all) {
      const key = row.connection.id + ":" + row.phone;
      if (seen.has(key)) repeated.add(key);
      seen.add(key);
    }
    return repeated;
  }, [all]);
  const options = useMemo(
    () => ({
      clients: [
        ...new Map([
          ...all.map((c) => [c.clientId, c.clientName] as const),
          ...assigned.map((l) => [l.clientId, l.clientName] as const),
        ]),
      ],
      operations: [
        ...new Map([
          ...all.map(
            (c) =>
              [c.operationCode, c.operationName || c.operationCode] as const,
          ),
          ...assigned.map(
            (l) =>
              [l.operationCode, l.operationName || l.operationCode] as const,
          ),
        ]),
      ].filter(([code]) => code),
      connections: [
        ...new Map([
          ...all.map(
            (c) =>
              [
                c.connection.id,
                `${c.connection.name} · +${c.connection.phone}`,
              ] as const,
          ),
          ...assigned.flatMap((l) =>
            l.connections.map(
              (c) => [c.id, `${c.name} · +${c.phone}`] as const,
            ),
          ),
        ]),
      ],
    }),
    [all, assigned],
  );
  const conversations = all.filter(
    (c) =>
      (client === "all" || c.clientId === client) &&
      (operation === "all" || c.operationCode === operation) &&
      (connection === "all" || c.connection.id === connection) &&
      (stage === "all" || c.stage === stage) &&
      matchesQuick(c, quick) &&
      matchesSearch(query, [
        c.contactName,
        c.phone,
        c.clientName,
        c.professionalName,
        c.lastMessagePreview,
      ]),
  );
  const pending = assigned.filter(
    (l) =>
      !all.some((c) => c.leadId === l.id) &&
      (quick === "all" || quick === "open") &&
      (client === "all" || l.clientId === client) &&
      (operation === "all" || l.operationCode === operation) &&
      (stage === "all" || l.stage === stage) &&
      (connection === "all" ||
        l.connections.some((c) => c.id === connection)) &&
      matchesSearch(query, [l.name, l.phone, l.clientName]),
  );
  const pendingLead =
    pending.find((l) => l.id === selectedLead) ??
    (!conversations.length ? pending[0] : undefined);
  const conversation = pendingLead
    ? undefined
    : selectedLead
      ? conversations.find((c) => c.leadId === selectedLead)
      : (conversations.find((c) => c.id === selected) ?? conversations[0]);
  const activeFilters = [client, operation, connection, stage].filter(
    (v) => v !== "all",
  ).length;
  async function selectEpisode(id: string) {
    await Promise.all([mutate(), mutateAssigned()]);
    setSelectedLead("");
    setSelected(id);
    clearFilters();
    setMobileChat(true);
  }
  function clearFilters() {
    setQuery("");
    setQuick("all");
    setClient("all");
    setOperation("all");
    setConnection("all");
    setStage("all");
  }
  const context = conversation ? (
    <ContextPanel
      key={conversation.id}
      conversation={conversation}
      onClose={() => {
        if (wide) setShowContext(false);
        else setDrawer(false);
      }}
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
      <h1 className="sr-only">Inbox</h1>
      <div
        className="inbox-layout"
        data-chat={mobileChat && (!!conversation || !!pendingLead)}
        data-context={wide && showContext && !!conversation}
      >
        <section className="inbox-list-panel" aria-label="Conversas">
          <header className="inbox-list-header">
            <div>
              <h2>Conversas</h2>
              <Badge>{conversations.length + pending.length}</Badge>
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
                  ["open", "Abertas"],
                  ["all", "Todas"],
                  ["closed", "Encerradas"],
                  ["unread", "Não lidas"],
                  ["reply", "Aguardando resposta"],
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
            </div>
            <RoutingReview onDone={selectEpisode} />
            <details className="inbox-filters">
              <summary>
                <SlidersHorizontal size={14} />
                Filtros adicionais{" "}
                {activeFilters > 0 && <Badge>{activeFilters}</Badge>}
              </summary>
              <div>
                <label>
                  Cliente
                  <select
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                  >
                    <option value="all">Todos os clientes</option>
                    {options.clients.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operação
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                  >
                    <option value="all">Todas as operações</option>
                    {options.operations.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Conexão WhatsApp
                  <select
                    value={connection}
                    onChange={(e) => setConnection(e.target.value)}
                  >
                    <option value="all">Todas as conexões</option>
                    {options.connections.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
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
                <small>
                  Você vê as conversas dos clientes aos quais tem acesso.
                  Somente o responsável pelo lead pode responder.
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
            {assignedError && (
              <p role="alert">
                Não foi possível carregar os atendimentos atribuídos.{" "}
                <button onClick={() => void mutateAssigned()}>
                  Tentar novamente
                </button>
              </p>
            )}
            {pending.map((l) => (
              <button
                className="inbox-conversation"
                key={`lead-${l.id}`}
                aria-pressed={pendingLead?.id === l.id}
                onClick={() => {
                  setSelectedLead(l.id);
                  setMobileChat(true);
                }}
              >
                <ContactAvatar name={l.name} />
                <span className="inbox-conversation-content">
                  <strong>{l.name}</strong>
                  <AppointmentTags stage={l.stage} />
                  <span className="inbox-client">{l.clientName}</span>
                  <span>Pronto para iniciar · Sem mensagens</span>
                </span>
              </button>
            ))}
            {conversations.map((c) => (
              <button
                className="inbox-conversation"
                key={c.id}
                aria-pressed={c.id === conversation?.id}
                onClick={() => {
                  setSelectedLead("");
                  setSelected(c.id);
                  setMobileChat(true);
                }}
              >
                <ContactAvatar name={c.contactName} />
                <span className="inbox-conversation-content">
                  <span className="inbox-conversation-name">
                    <strong>{c.contactName}</strong>
                    {c.lastMessageAt && (
                      <time dateTime={c.lastMessageAt}>
                        {messageTime(c.lastMessageAt)}
                      </time>
                    )}
                  </span>
                  <AppointmentTags stage={c.stage} />
                  <span className="inbox-professional">
                    {c.professionalName || "Sem profissional vinculado"}
                  </span>
                  <span
                    className="inbox-operation"
                    data-operation={c.operationCode}
                  >
                    {c.clientName}
                    {c.operationName ? ` · ${c.operationName}` : ""}
                  </span>
                  {repeatedContacts.has(c.connection.id + ":" + c.phone) && (
                    <small>
                      Atendimento de{" "}
                      {new Date(c.createdAt).toLocaleString("pt-BR")} ·{" "}
                      {c.ownerName || "Sem responsável"}
                    </small>
                  )}
                  <span className="inbox-message-preview">
                    {c.lastMessagePreview || "Nenhuma mensagem registrada"}
                  </span>
                  <span className="inbox-conversation-meta">
                    {c.unreadCount > 0 && (
                      <span className="inbox-unread">
                        {c.unreadCount}
                        <span className="sr-only"> não lidas</span>
                      </span>
                    )}
                    {c.status === "closed" && <span>Encerrado</span>}
                    {c.status !== "closed" && waitingFor(c) === "reply" && (
                      <span className="inbox-reply-status">
                        Aguardando resposta
                      </span>
                    )}
                    {!c.mine && (
                      <span className="inbox-readonly-tag">
                        Somente leitura
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
            {isLoading && (
              <div className="inbox-list-empty" role="status">
                <p>Carregando conversas…</p>
              </div>
            )}
            {error && !isLoading && (
              <div className="inbox-list-empty" role="alert">
                <h3>Não foi possível carregar as conversas</h3>
                <p>{error.message}</p>
                <Button size="sm" variant="outline" onClick={() => mutate()}>
                  Tentar novamente
                </Button>
              </div>
            )}
            {!isLoading &&
              !error &&
              !conversations.length &&
              !pending.length && (
                <div className="inbox-list-empty">
                  <MessagesSquare size={26} />
                  <h3>
                    {all.length
                      ? "Nenhuma conversa encontrada"
                      : "Nenhuma conversa ainda"}
                  </h3>
                  <p>
                    {all.length
                      ? "Ajuste os filtros para encontrar o contato."
                      : "Seus atendimentos atribuídos aparecerão aqui, mesmo antes da primeira mensagem."}
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
        {pendingLead ? (
          <StartConversation
            key={pendingLead.id}
            lead={pendingLead}
            onBack={() => setMobileChat(false)}
            onStarted={async (id) => {
              setSelected(id);
              setSelectedLead("");
              await mutate();
              await mutateAssigned();
            }}
          />
        ) : conversation ? (
          <ChatPanel
            onEpisode={selectEpisode}
            key={conversation.id}
            conversation={conversation}
            draft={drafts[conversation.id] ?? ""}
            onDraft={(text) =>
              setDrafts((previous) => ({
                ...previous,
                [conversation.id]: text,
              }))
            }
            onBack={() => setMobileChat(false)}
            action={
              chatAction?.conversationId === conversation.id
                ? chatAction.kind
                : null
            }
            onAction={(kind) =>
              setChatAction(
                kind ? { conversationId: conversation.id, kind } : null,
              )
            }
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
    </div>
  );
}
export { Queue } from "@/features/queue/queue";

function AppointmentTags({ stage }: { stage: string }) {
  if (stage !== "scheduled" && stage !== "confirmed") return null;
  return (
    <span className="inbox-booking-tags">
      <span>Agendado</span>
      <span data-confirmed={stage === "confirmed"}>
        {stage === "confirmed" ? "Confirmado" : "Sem confirmação"}
      </span>
    </span>
  );
}
