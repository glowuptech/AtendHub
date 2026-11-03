"use client";
import { useEffect, useRef, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Badge, dateTime, stageLabels } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
export function LeadModal({
  clientId,
  id,
  onClose,
  onConverse,
}: {
  clientId: string;
  id: string;
  onClose: () => void;
  onConverse: () => void;
}) {
  const { repositories, refresh } = useDemo(),
    dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("Resumo"),
    [title, setTitle] = useState(""),
    [due, setDue] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      queueMicrotask(() => {
        if (opener instanceof HTMLElement && opener.isConnected)
          opener.focus({ preventScroll: true });
      });
    };
  }, []);
  const lead = repositories.leads.get(clientId, id),
    client = repositories.clients.get(clientId),
    form = repositories.forms.get(clientId, lead.formId),
    version = form.versions.find((v) => v.id === lead.versionId);
  const messages = repositories.inbox
    .list(clientId)
    .filter((c) => c.leadId === id)
    .flatMap((c) => c.messages)
    .sort((a, b) => a.at.localeCompare(b.at));
  const appointments = repositories.appointments
    .list(clientId)
    .filter((a) => a.leadId === id)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  return (
    <dialog
      ref={dialog}
      className="lead-modal"
      aria-labelledby="lead-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className="lead-modal-header">
        <div>
          <small>{client.name}</small>
          <h2 id="lead-modal-title">{lead.name}</h2>
          <Badge>{stageLabels[lead.stage]}</Badge>
        </div>
        <Button variant="ghost" aria-label="Fechar lead" onClick={onClose}>
          <X size={20} />
        </Button>
      </header>
      <div className="lead-modal-actions">
        <span>{lead.contact?.phone || "Telefone não informado"}</span>
        <Button onClick={onConverse}>
          <MessageCircle size={16} />
          Conversar no Inbox
        </Button>
      </div>
      <div className="tabs" aria-label="Informações do lead">
        {[
          "Resumo",
          "Respostas",
          "Mensagens",
          "Tarefas",
          "Agendamentos",
          "Histórico",
        ].map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "ghost"}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Tarefas"
              ? ` (${lead.tasks?.filter((t) => !t.completed).length ?? 0})`
              : ""}
          </Button>
        ))}
      </div>
      <div className="lead-modal-body">
        {tab === "Resumo" && (
          <>
            <div className="lead-summary-grid">
              <section>
                <h3>Contato</h3>
                <p>{lead.contact?.email || "E-mail não informado"}</p>
                <p>Responsável: {lead.owner || "Não atribuído"}</p>
                <p>Próxima ação: {lead.nextAction}</p>
              </section>
              <section>
                <h3>Cadastro</h3>
                <p>
                  {form.name} · versão {version?.number ?? "—"}
                </p>
                <p>{dateTime(lead.createdAt)}</p>
                <p>
                  {lead.captureStatus === "incomplete"
                    ? "Cadastro incompleto"
                    : lead.captureStatus === "in_progress"
                      ? "Cadastro em andamento"
                      : "Cadastro concluído"}
                </p>
              </section>
            </div>
            <div className="lead-summary-grid">
              <section>
                <h3>Última mensagem</h3>
                <p>{messages.at(-1)?.body || "Nenhuma mensagem registrada"}</p>
                {messages.at(-1) && (
                  <small>{dateTime(messages.at(-1)!.at)}</small>
                )}
              </section>
              <section>
                <h3>Agendamentos</h3>
                <p>
                  {appointments.length
                    ? `${appointments.length} agendamento(s) registrado(s)`
                    : "Nenhum agendamento registrado"}
                </p>
                <p>
                  {
                    appointments.filter((a) => a.attendance === "present")
                      .length
                  }{" "}
                  comparecimento(s) informado(s)
                </p>
                <h3>Tarefas pendentes</h3>
                <p>{lead.tasks?.filter((t) => !t.completed).length ?? 0}</p>
              </section>
            </div>
          </>
        )}
        {tab === "Respostas" && (
          <>
            <h3>Respostas do formulário</h3>
            {!lead.fields.length && <p>Nenhuma resposta registrada ainda.</p>}
            {lead.fields.map((a, i) => {
              const field = repositories.fields.get(
                  clientId,
                  a.fieldDefinitionId,
                ),
                q = version?.steps.find((s) => s.question.id === a.questionId);
              const text = (v: string) =>
                field.options.find((o) => o.id === v)?.label ?? v;
              return (
                <section key={`${a.questionId}-${i}`}>
                  <h4>{q?.question.label ?? field.label}</h4>
                  <p className="preserve-lines">
                    {a.value === null
                      ? "Não informado"
                      : Array.isArray(a.value)
                        ? a.value.map(text).join(", ")
                        : typeof a.value === "boolean"
                          ? a.value
                            ? "Sim"
                            : "Não"
                          : text(String(a.value))}
                  </p>
                </section>
              );
            })}
          </>
        )}
        {tab === "Mensagens" && (
          <>
            <h3>Mensagens recentes</h3>
            {!messages.length && (
              <p>Nenhuma mensagem registrada para este lead.</p>
            )}
            {messages.slice(-20).map((m) => (
              <section key={m.id}>
                <small>
                  {m.direction === "inbound" ? "Contato" : "Equipe"} ·{" "}
                  {dateTime(m.at)}
                </small>
                <p className="preserve-lines">{m.body}</p>
              </section>
            ))}
          </>
        )}
        {tab === "Tarefas" && (
          <>
            <h3>Tarefas do atendimento</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  repositories.leads.addTask(clientId, id, title, due || null);
                  refresh();
                  setTitle("");
                  setDue("");
                  setError("");
                } catch {
                  setError(
                    "Preencha uma tarefa de 2 a 200 caracteres e uma data válida.",
                  );
                }
              }}
            >
              <label>
                Nova tarefa
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Prazo (opcional)
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <Button type="submit">Adicionar tarefa</Button>
              {error && <p role="alert">{error}</p>}
            </form>
            {!lead.tasks?.length && <p>Nenhuma tarefa cadastrada.</p>}
            {lead.tasks?.map((t) => (
              <section key={t.id}>
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => {
                      repositories.leads.toggleTask(clientId, id, t.id);
                      refresh();
                    }}
                  />
                  {t.title}
                </label>
                <small>
                  {t.dueOn
                    ? `Prazo: ${t.dueOn.split("-").reverse().join("/")}`
                    : "Sem prazo"}{" "}
                  · {t.completed ? "Concluída" : "Pendente"}
                </small>
              </section>
            ))}
          </>
        )}
        {tab === "Agendamentos" && (
          <>
            <h3>Histórico de agendamentos</h3>
            {!appointments.length && (
              <p>Nenhum agendamento registrado para este lead.</p>
            )}
            {appointments.map((a) => (
              <section key={a.id}>
                <strong>{dateTime(a.scheduledAt)}</strong>
                <p>
                  {a.attendance === "present"
                    ? "Compareceu"
                    : a.attendance === "absent"
                      ? "Não compareceu"
                      : "Presença ainda não informada"}
                </p>
                <small>{a.source}</small>
              </section>
            ))}
            <p>
              O estágio do Kanban não altera automaticamente a agenda ou o
              comparecimento.
            </p>
          </>
        )}
        {tab === "Histórico" && (
          <>
            <h3>Histórico do lead</h3>
            {[...lead.history]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((h) => (
                <section key={h.id}>
                  <small>{dateTime(h.at)}</small>
                  <p>{h.label}</p>
                </section>
              ))}
          </>
        )}
      </div>
    </dialog>
  );
}
