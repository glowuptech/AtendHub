"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { useClients } from "@/features/clients/hooks";
import { Button } from "@/components/ui/button";
import { formatPhone, statuses, type Connection } from "./model";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok)
    throw new Error(body.error ?? "Não foi possível carregar as conexões.");
  return body as Connection[];
};
export function WhatsappSettings() {
  const { data: clients = [], error: clientsError } = useClients();
  const {
    data: connections = [],
    error,
    isLoading,
    mutate,
  } = useSWR("/api/whatsapp/connections", fetcher, { refreshInterval: 10000 });
  const [clientId, setClientId] = useState(""),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [editPhone, setEditPhone] = useState("");
  const lock = useRef(false),
    keys = useRef<Record<string, string>>({});
  const client = clients.find((c) => c.id === clientId);
  async function send(url: string, body: Record<string, string>, key: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setNotice("");
    keys.current[key] ??= crypto.randomUUID();
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, requestId: keys.current[key] }),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error ?? "Não foi possível solicitar a ação.");
      delete keys.current[key];
      setNotice(
        result.delivery === "delivered"
          ? "Evento recebido pelo n8n. Aguardando confirmação do resultado da integração."
          : result.delivery === "unconfigured"
            ? "Cadastro e evento salvos. Configure o webhook e a assinatura no servidor; depois clique em Reenviar evento."
            : "Evento salvo, mas o envio não foi confirmado. Use Reenviar evento para tentar novamente.",
      );
      await mutate();
      return true;
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Erro de conexão. Tente novamente.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="webhook-settings">
      <h2>Conexão WhatsApp</h2>
      <p>
        Cadastre números por cliente. O n8n cria e gerencia a instância na
        Evolution API.
      </p>
      <p role="status">{notice}</p>
      {error && (
        <p role="alert">
          {error.message}{" "}
          <button type="button" onClick={() => void mutate()}>
            Tentar novamente
          </button>
        </p>
      )}
      {clientsError && (
        <p role="alert">Não foi possível carregar os clientes autorizados.</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await send(
              "/api/whatsapp/connections",
              { clientId, name, phone },
              `create:${clientId}:${name}:${phone}`,
            )
          ) {
            setName("");
            setPhone("");
          }
        }}
      >
        <fieldset disabled={busy || Boolean(error) || Boolean(clientsError)}>
          <legend>Adicionar número</legend>
          <label>
            Cliente
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Selecione o cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome da instância
            <input
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: recepcao"
            />
          </label>
          <p className="muted">
            Instância:{" "}
            {client
              ? `${client.name}-${name || "nome-da-instancia"}`
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
              : "Selecione o cliente"}
            . O prefixo é gerado automaticamente e o identificador fica estável
            após o cadastro.
          </p>
          <label>
            WhatsApp (DDD e número)
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(16) 99999-9999"
            />
          </label>
          <Button type="submit">
            {busy ? "Enviando…" : "Adicionar número"}
          </Button>
        </fieldset>
      </form>
      <h3>Números cadastrados</h3>
      {isLoading && <p role="status">Carregando…</p>}
      {!isLoading && !error && !connections.length && (
        <p>Nenhum número cadastrado.</p>
      )}
      {connections.map((c) => (
        <article className="card" key={c.id}>
          <h3>{c.instance_name}</h3>
          <p>
            Cliente:{" "}
            {clients.find((x) => x.id === c.client_id)?.name ??
              "Cliente vinculado"}
          </p>
          <p>
            {formatPhone(c.phone)} ·{" "}
            <strong>{statuses[c.status] ?? c.status}</strong>
          </p>
          <div className="actions">
            <Button
              disabled={
                busy ||
                ["confirming", "updating", "delete_pending"].includes(c.status)
              }
              onClick={() =>
                void send(
                  `/api/whatsapp/connections/${c.id}`,
                  { action: "confirm" },
                  `confirm:${c.id}`,
                )
              }
            >
              Confirmar conexão
            </Button>
            <Button
              variant="outline"
              disabled={
                busy ||
                ["confirming", "updating", "delete_pending"].includes(c.status)
              }
              onClick={() => {
                setEditId(c.id);
                setEditPhone(formatPhone(c.phone));
              }}
            >
              Atualizar conexão
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void send(
                  `/api/whatsapp/connections/${c.id}`,
                  { action: "retry" },
                  `retry:${c.id}`,
                )
              }
            >
              Reenviar evento
            </Button>
            <Button
              variant="ghost"
              disabled={busy || c.status === "delete_pending"}
              onClick={() => {
                if (
                  window.confirm(
                    `Solicitar exclusão de ${c.instance_name}? O n8n excluirá a instância.`,
                  )
                )
                  void send(
                    `/api/whatsapp/connections/${c.id}`,
                    { action: "delete" },
                    `delete:${c.id}`,
                  );
              }}
            >
              Excluir conexão
            </Button>
          </div>
          {editId === c.id && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await send(
                    `/api/whatsapp/connections/${c.id}`,
                    { action: "update", phone: editPhone },
                    `update:${c.id}:${editPhone}`,
                  )
                )
                  setEditId(null);
              }}
            >
              <label>
                Novo número com DDD
                <input
                  required
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                />
              </label>
              <p className="muted">
                Cliente e identificador da instância permanecem os mesmos. Para
                outra instância, adicione um novo cadastro.
              </p>
              <Button disabled={busy}>Salvar atualização</Button>{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditId(null)}
              >
                Cancelar
              </Button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
