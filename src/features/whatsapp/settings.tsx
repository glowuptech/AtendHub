"use client";
import { useRef, useState, useEffect } from "react";
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
    [noticeError, setNoticeError] = useState(false),
    [busy, setBusy] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [editPhone, setEditPhone] = useState("");
  const [qr, setQr] = useState<{
    connectionId: string;
    image?: string;
    pairingCode?: string;
    expiresAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [qr]);
  const lock = useRef(false),
    keys = useRef<Record<string, string>>({});
  const client = clients.find((c) => c.id === clientId);
  async function send(url: string, body: Record<string, string>, key: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    keys.current[key] ??= crypto.randomUUID();
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, requestId: keys.current[key] }),
      });
      const result = await r.json().catch(() => null);
      if (!r.ok) {
        await mutate().catch(() => undefined);
        setNoticeError(true);
        throw new Error(
          result?.error ?? "Não foi possível confirmar a resposta do n8n.",
        );
      }
      delete keys.current[key];
      if (result.kind !== "stale" && (result.qrCode || result.pairingCode)) {
        setNow(Date.now());
        setQr({
          connectionId: result.connectionId,
          image: result.qrCode,
          pairingCode: result.pairingCode,
          expiresAt: Date.parse(result.qrExpiresAt),
        });
      } else if (result.status === "connected" || result.status === "deleted")
        setQr((current) =>
          current?.connectionId === result.connectionId ? null : current,
        );
      if (result.kind === "stale") {
        setNotice(result.message);
      } else if (result.kind === "received") {
        setNotice(
          `${result.message} A resposta não confirmou o resultado da Evolution; a conexão não será marcada como conectada.`,
        );
      } else {
        const state = result.status ? statuses[result.status] : null;
        setNotice(
          state ? `${result.message} Estado salvo: ${state}.` : result.message,
        );
      }
      await mutate().catch(() => undefined);
      return true;
    } catch (cause) {
      setNoticeError(true);
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Erro de conexão. O evento continua salvo para reenvio.",
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
      {notice && <p role={noticeError ? "alert" : "status"}>{notice}</p>}
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
          {qr?.connectionId === c.id &&
            !["connected", "deleted", "delete_pending"].includes(c.status) && (
              <section
                className="whatsapp-qr"
                aria-label={`QR Code de ${c.instance_name}`}
              >
                <h4>Escaneie para conectar o WhatsApp</h4>
                <p>
                  No celular: WhatsApp → Aparelhos conectados → Conectar um
                  aparelho.
                </p>
                {qr.expiresAt > now ? (
                  <>
                    {/* Native image is intentional for an ephemeral data URL. */}
                    {qr.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qr.image}
                        alt="QR Code para conectar o WhatsApp"
                        width={280}
                        height={280}
                      />
                    )}
                    {qr.pairingCode && (
                      <p>
                        Código de pareamento: <strong>{qr.pairingCode}</strong>
                      </p>
                    )}
                    <p role="status">
                      Disponível por{" "}
                      {Math.max(0, Math.ceil((qr.expiresAt - now) / 1000))}{" "}
                      segundos. Após escanear, clique em Confirmar conexão.
                    </p>
                  </>
                ) : (
                  <p role="status">
                    QR Code expirado. Solicite um novo código.
                  </p>
                )}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setQr(null)}
                >
                  Fechar QR Code
                </Button>
              </section>
            )}
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
            {![
              "connected",
              "delete_pending",
              "confirming",
              "updating",
            ].includes(c.status) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void send(
                    `/api/whatsapp/connections/${c.id}`,
                    { action: "update", phone: c.phone },
                    `qr:${c.id}`,
                  )
                }
              >
                Gerar novo QR Code
              </Button>
            )}
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
