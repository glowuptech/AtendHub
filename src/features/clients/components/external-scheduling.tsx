"use client";
import { useState } from "react";
import useSWR from "swr";
import { useClients } from "../hooks";
import { Card } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { schedulingSchema } from "../accesses/model";
type Config = { name: string; url: string; canEdit: boolean };
export function ExternalScheduling({ clientId }: { clientId: string }) {
  const { mutate: refreshClients } = useClients();
  const endpoint = `/api/clients/${clientId}/scheduling`;
  const { data, error, isLoading, mutate } = useSWR<Config>(
    endpoint,
    async (url: string) => {
      const r = await fetch(url, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          body.error ?? "Não foi possível carregar a plataforma.",
        );
      return body;
    },
  );
  const [edited, setEdited] = useState<Config | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const draft = edited ?? data;
  if (isLoading)
    return (
      <Card>
        <p role="status">Carregando plataforma…</p>
      </Card>
    );
  if (error || !data || !draft)
    return (
      <Card>
        <p role="alert">
          {error?.message ?? "Não foi possível carregar a plataforma."}
        </p>
        <Button onClick={() => void mutate()}>Tentar novamente</Button>
      </Card>
    );
  const safeUrl = schedulingSchema.safeParse(data);
  return (
    <Card title="Plataforma de agendamento externo">
      {data.url && safeUrl.success ? (
        <p>
          <a
            className="button button-primary"
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir {data.name || "plataforma de agendamento"}
          </a>
        </p>
      ) : (
        <p>Nenhuma plataforma de agendamento cadastrada.</p>
      )}
      {data.canEdit && (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = schedulingSchema.safeParse(draft);
            if (!parsed.success) {
              setNotice(parsed.error.issues[0].message);
              return;
            }
            setBusy(true);
            setNotice("");
            try {
              const r = await fetch(endpoint, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(parsed.data),
              });
              const body = await r.json();
              if (!r.ok) throw new Error(body.error);
              await mutate(body, { revalidate: false });
              setEdited(null);
              await refreshClients();
              setNotice("Plataforma salva.");
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
            <label>
              Nome da plataforma
              <input
                value={draft.name}
                maxLength={120}
                placeholder="Ex.: Doctoralia"
                onChange={(e) => setEdited({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              URL de agendamento
              <input
                type="url"
                value={draft.url}
                maxLength={2000}
                placeholder="https://..."
                onChange={(e) => setEdited({ ...draft, url: e.target.value })}
              />
            </label>
            <p className="muted">
              Use o endereço da plataforma. Logins e senhas ficam na aba
              Acessos.
            </p>
            <Button type="submit">
              {busy ? "Salvando…" : "Salvar plataforma"}
            </Button>{" "}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEdited(null);
                setNotice("");
              }}
            >
              Cancelar alterações
            </Button>
          </fieldset>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
    </Card>
  );
}
