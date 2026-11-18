"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { externalUrl, type AccessRecord } from "../accesses/model";
const empty = () => ({
  label: "",
  url: "",
  login: "",
  password: "",
  notes: "",
});
function AccessItem({
  item,
  endpoint,
  onEdit,
  onDelete,
  onNotice,
}: {
  item: AccessRecord;
  endpoint: string;
  onEdit: () => void;
  onDelete: () => void;
  onNotice: (message: string) => void;
}) {
  const [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function reveal(copy = false) {
    setBusy(true);
    try {
      const r = await fetch(`${endpoint}/${item.id}`, {
        method: "POST",
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (copy) {
        await navigator.clipboard.writeText(body.password);
        onNotice("Senha copiada.");
      } else {
        setSecret(body.password);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSecret(""), 30000);
      }
    } catch (cause) {
      onNotice(
        cause instanceof Error
          ? cause.message
          : "Não foi possível acessar a senha.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card">
      <h3>{item.label}</h3>
      <p>Login: {item.login}</p>
      <p>
        Senha:{" "}
        <span style={{ overflowWrap: "anywhere" }}>{secret || "••••••••"}</span>
      </p>
      {item.url && externalUrl.safeParse(item.url).success && (
        <p>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            Abrir plataforma
          </a>
        </p>
      )}
      {item.notes && <p>{item.notes}</p>}
      <div className="actions">
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => (secret ? setSecret("") : void reveal())}
        >
          {secret ? "Ocultar senha" : "Revelar senha"}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void reveal(true)}
        >
          Copiar senha
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void navigator.clipboard.writeText(item.login).then(
              () => onNotice("Login copiado."),
              () => onNotice("Não foi possível copiar o login."),
            )
          }
        >
          Copiar login
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSecret("");
            onEdit();
          }}
        >
          Editar
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSecret("");
            onDelete();
          }}
        >
          Excluir
        </Button>
      </div>
    </article>
  );
}
export function ClientAccesses({ clientId }: { clientId: string }) {
  const endpoint = `/api/clients/${clientId}/accesses`;
  const { data, error, isLoading, mutate } = useSWR<AccessRecord[]>(
    endpoint,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error ?? "Não foi possível carregar os acessos.");
      return body;
    },
    { revalidateOnFocus: false },
  );
  const [draft, setDraft] = useState(empty),
    [editing, setEditing] = useState<string | null>(null),
    [showForm, setShowForm] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (isLoading)
    return (
      <Card>
        <p role="status">Carregando acessos…</p>
      </Card>
    );
  if (error)
    return (
      <Card>
        <p role="alert">{error.message}</p>
        <Button onClick={() => void mutate()}>Tentar novamente</Button>
      </Card>
    );
  return (
    <Card title="Acessos do cliente">
      <p>
        Plataformas, logins e senhas. As senhas ficam ocultas e são reveladas
        somente quando solicitado.
      </p>
      {notice && <p role="status">{notice}</p>}
      <Button
        disabled={busy}
        onClick={() => {
          setDraft(empty());
          setEditing(null);
          setShowForm(true);
          setNotice("");
        }}
      >
        Adicionar acesso
      </Button>
      {showForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const r = await fetch(
                editing ? `${endpoint}/${editing}` : endpoint,
                {
                  method: editing ? "PATCH" : "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(draft),
                },
              );
              const body = await r.json();
              if (!r.ok) throw new Error(body.error);
              setDraft(empty());
              setShowForm(false);
              setEditing(null);
              await mutate();
              setNotice("Acesso salvo.");
            } catch (cause) {
              setNotice(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível salvar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>{editing ? "Editar acesso" : "Novo acesso"}</legend>
            <label>
              Plataforma
              <input
                required
                minLength={2}
                maxLength={120}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label>
              URL da plataforma (opcional)
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
            </label>
            <label>
              Login ou e-mail
              <input
                required
                maxLength={240}
                autoComplete="off"
                value={draft.login}
                onChange={(e) => setDraft({ ...draft, login: e.target.value })}
              />
            </label>
            <label>
              {editing ? "Nova senha (deixe em branco para manter)" : "Senha"}
              <input
                required={!editing}
                maxLength={2048}
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
              />
            </label>
            <label>
              Observações
              <textarea
                maxLength={1000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <Button type="submit">
              {busy ? "Salvando…" : "Salvar acesso"}
            </Button>{" "}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(empty());
                setShowForm(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
          </fieldset>
        </form>
      )}
      {!data?.length && <p>Nenhum acesso cadastrado.</p>}
      {data?.map((item) => (
        <AccessItem
          key={item.id + item.updated_at}
          item={item}
          endpoint={endpoint}
          onNotice={setNotice}
          onEdit={() => {
            setDraft({ ...item, password: "" });
            setEditing(item.id);
            setShowForm(true);
            setNotice("");
          }}
          onDelete={async () => {
            if (busy || !window.confirm(`Excluir o acesso ${item.label}?`))
              return;
            setBusy(true);
            try {
              const r = await fetch(`${endpoint}/${item.id}`, {
                method: "DELETE",
              });
              if (!r.ok) throw new Error("Não foi possível excluir o acesso.");
              await mutate();
              setNotice("Acesso excluído.");
            } catch (cause) {
              setNotice(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível excluir.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ))}
    </Card>
  );
}
