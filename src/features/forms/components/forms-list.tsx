"use client";
import { useEffect, useState } from "react";
import { FileText, Plus, Archive, ArchiveRestore } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { useClients } from "@/features/clients/hooks";
import { useForms } from "../hooks";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Denied,
  Empty,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";

export function FormsList({ id }: { id: string }) {
  const { setClientId } = useDemo();
  const {
    data: clients,
    error: clientsError,
    isLoading: clientsLoading,
  } = useClients();
  const { data: forms = [], error, isLoading, mutate } = useForms(id);
  const [view, setView] = useState<"current" | "archived">("current");
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState("");
  const client = clients?.find((item) => item.id === id);
  useEffect(() => {
    if (client) setClientId(client.id);
  }, [client, setClientId]);
  if (clientsLoading)
    return <p role="status">Carregando cliente autorizado…</p>;
  if (clientsError)
    return (
      <p role="alert">Não foi possível consultar os clientes autorizados.</p>
    );
  if (!client) return <Denied />;
  const visible = forms.filter((form) =>
    view === "archived"
      ? form.status === "archived"
      : form.status !== "archived" &&
        (status === "all" || form.status === status),
  );
  const archived = forms.filter((form) => form.status === "archived").length;
  async function changeStatus(formId: string, restore: boolean) {
    if (pending) return;
    if (
      !restore &&
      !window.confirm(
        "Arquivar este formulário? Ele sairá da lista de uso e poderá ser recuperado em Arquivados.",
      )
    )
      return;
    setPending(formId);
    setNotice("");
    setActionError("");
    try {
      const response = await fetch(
        `/api/forms/${formId}`,
        restore
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "restore" }),
            }
          : { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível atualizar o formulário.",
        );
      setNotice(
        restore
          ? "Formulário desarquivado como rascunho. Ele está disponível em Em uso, sem republicação automática."
          : "Formulário arquivado. Você pode recuperá-lo em Arquivados.",
      );
      await mutate();
      if (restore) {
        setStatus("all");
        setView("current");
      }
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar o formulário. Tente novamente.",
      );
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <Heading
        eyebrow={client.name}
        title="Formulários"
        description="Crie, edite e organize os formulários deste cliente."
        action={
          <NavButton href={`/app/clientes/${id}/formularios/novo`}>
            <Plus size={16} />
            Novo formulário
          </NavButton>
        }
      />
      <div
        className="form-archive-tabs"
        role="group"
        aria-label="Lista de formulários"
      >
        <Button
          variant={view === "current" ? "default" : "outline"}
          aria-pressed={view === "current"}
          onClick={() => setView("current")}
        >
          Em uso ({forms.length - archived})
        </Button>
        <Button
          variant={view === "archived" ? "default" : "outline"}
          aria-pressed={view === "archived"}
          onClick={() => setView("archived")}
        >
          <Archive size={16} />
          Arquivados ({archived})
        </Button>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {error && (
        <div role="alert">
          <p>Não foi possível carregar os formulários persistidos.</p>
          <Button
            variant="outline"
            onClick={() => {
              void mutate();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {view === "current" && (
        <div className="toolbar">
          <label className="push-right">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">Todos em uso</option>
              <option value="demo">Ativo</option>
              <option value="draft">Rascunho</option>
            </select>
          </label>
        </div>
      )}
      {isLoading ? (
        <p role="status">Carregando formulários…</p>
      ) : (
        !error && (
          <div className="cards-grid">
            {visible.map((form) => {
              const version =
                form.versions.find(
                  (item) => item.id === form.activeVersionId,
                ) ?? form.versions.at(-1);
              return (
                <Card key={form.id}>
                  <div className="section-caption">
                    <span className="large-icon">
                      <FileText />
                    </span>
                    <Badge>
                      {form.status === "archived"
                        ? "Arquivado"
                        : form.status === "draft"
                          ? "Rascunho"
                          : "Ativo"}
                    </Badge>
                  </div>
                  <h2>{form.name}</h2>
                  <p>
                    {version?.steps.length ?? 0} perguntas · versão{" "}
                    {version?.number ?? 1} · {form.versions.length} versão(ões)
                    preservada(s)
                  </p>
                  <div className="actions">
                    {form.status !== "archived" && (
                      <NavButton
                        href={`/app/clientes/${id}/formularios/${form.id}/editar`}
                      >
                        Editar
                      </NavButton>
                    )}
                    <NavButton
                      href={`/app/clientes/${id}/formularios/${form.id}/preview`}
                    >
                      Prévia
                    </NavButton>
                    {form.status === "demo" && (
                      <NavButton href={`/f/${form.slug}`}>
                        Abrir formulário
                      </NavButton>
                    )}
                    <NavButton href="/app/leads">Respostas no CRM</NavButton>
                  </div>
                  <div className="actions separated">
                    {form.status === "archived" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!pending}
                        onClick={() => {
                          void changeStatus(form.id, true);
                        }}
                      >
                        <ArchiveRestore size={14} />
                        {pending === form.id ? "Recuperando…" : "Desarquivar"}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!pending}
                        onClick={() => {
                          void changeStatus(form.id, false);
                        }}
                      >
                        <Archive size={14} />
                        {pending === form.id ? "Arquivando…" : "Arquivar"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}
      {!isLoading && !error && !visible.length && (
        <Empty
          title={
            view === "archived"
              ? "Nenhum formulário arquivado"
              : "Nenhum formulário"
          }
          description={
            view === "archived"
              ? "Formulários arquivados poderão ser recuperados aqui."
              : status === "all"
                ? "Crie o primeiro formulário deste cliente."
                : "Nenhum formulário neste status."
          }
        />
      )}
    </>
  );
}
