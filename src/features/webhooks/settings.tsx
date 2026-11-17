"use client";
import useSWR from "swr";
import { useState } from "react";
import { Webhook, Save, RotateCcw } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/layout/shared";
import {
  WebhookConfigSchema,
  webhookDestinations,
  type WebhookConfig,
} from "./config";
export function WebhookSettings() {
  const { webhookConfig, setWebhookConfig } = useDemo();
  const {
    data: persisted,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR("/api/settings/webhooks", async (url: string) => {
    const r = await fetch(url);
    const body = await r.json();
    if (!r.ok)
      throw new Error(body.error ?? "Não foi possível carregar os webhooks.");
    return WebhookConfigSchema.parse(body);
  });
  const [saving, setSaving] = useState(false);
  const [edited, setDraft] = useState<WebhookConfig | null>(null),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const draft = edited ?? persisted ?? webhookConfig;
  const savedConfig = persisted ?? webhookConfig;
  const dirty = webhookDestinations.some(
    ({ id }) => draft[id] !== savedConfig[id],
  );
  function discard() {
    setDraft(null);
    setErrors({});
    setNotice("Alterações descartadas.");
  }
  return (
    <div className="webhook-settings">
      <div className="section-caption">
        <div>
          <h2>Webhooks</h2>
          <p className="muted">Destinos do n8n para cada fluxo da operação.</p>
        </div>
        <Badge>
          {webhookDestinations.filter(({ id }) => !!savedConfig[id]).length} de{" "}
          {webhookDestinations.length} URLs cadastradas
        </Badge>
      </div>
      <p className="team-note">
        URLs salvas por organização no servidor. Conexões WhatsApp usam este
        destino; os demais fluxos continuam dependendo de suas integrações. As
        assinaturas são configuradas nas variáveis de ambiente, não nesta tela.
      </p>
      {persisted &&
        webhookDestinations.every(({ id }) => !persisted[id]) &&
        webhookDestinations.some(({ id }) => Boolean(webhookConfig[id])) && (
          <p className="team-note">
            Há URLs antigas na memória desta sessão.{" "}
            <button
              type="button"
              onClick={() => {
                setDraft({ ...webhookConfig });
                setNotice(
                  "URLs recuperadas da sessão. Clique em Salvar webhooks para persistir no servidor.",
                );
              }}
            >
              Recuperar URLs desta sessão
            </button>
          </p>
        )}
      {loadError && <p role="alert">{loadError.message}</p>}
      {isLoading && <p role="status">Carregando webhooks…</p>}
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const parsed = WebhookConfigSchema.safeParse(draft);
          if (!parsed.success) {
            const next: Record<string, string> = {};
            parsed.error.issues.forEach((issue) => {
              next[String(issue.path[0])] = issue.message;
            });
            setErrors(next);
            setNotice("");
            document
              .getElementById(
                `webhook-${String(parsed.error.issues[0].path[0])}`,
              )
              ?.focus();
            return;
          }
          setSaving(true);
          try {
            const response = await fetch("/api/settings/webhooks", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(parsed.data),
            });
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error ?? "Não foi possível salvar.");
            await mutate(body, { revalidate: false });
            setWebhookConfig(body);
            setDraft(null);
            setErrors({});
            setNotice(
              "Webhooks salvos no servidor. Nenhum evento de teste foi enviado.",
            );
          } catch (cause) {
            setNotice(
              cause instanceof Error
                ? cause.message
                : "Não foi possível salvar.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        {webhookDestinations.map(({ id, title, description, events }) => (
          <fieldset
            disabled={saving || isLoading || Boolean(loadError)}
            className="webhook-destination"
            key={id}
          >
            <legend>{title}</legend>
            <div className="webhook-caption">
              <Webhook size={17} aria-hidden="true" />
              <Badge>
                {savedConfig[id] ? "URL cadastrada" : "Não configurado"}
              </Badge>
              {draft[id] !== savedConfig[id] && (
                <small>Alteração não salva</small>
              )}
            </div>
            <p id={`webhook-description-${id}`}>{description}</p>
            <label htmlFor={`webhook-${id}`}>URL — {title}</label>
            <input
              id={`webhook-${id}`}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={2000}
              placeholder="https://seu-n8n.exemplo/webhook/..."
              value={draft[id]}
              aria-invalid={!!errors[id]}
              aria-describedby={`webhook-description-${id}${errors[id] ? ` webhook-error-${id}` : ""}`}
              onChange={(e) => {
                setDraft({ ...draft, [id]: e.target.value });
                setNotice("");
                setErrors((previous) => ({ ...previous, [id]: "" }));
              }}
            />
            {errors[id] && (
              <p
                id={`webhook-error-${id}`}
                className="field-error"
                role="alert"
              >
                {errors[id]}
              </p>
            )}
            <div className="webhook-events">
              <small>
                Evento{events.length > 1 ? "s" : ""} previsto
                {events.length > 1 ? "s" : ""}
              </small>
              {events.map((event) => (
                <code key={event}>{event}</code>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="muted webhook-help">
          Deixe um campo vazio e salve para remover o destino. O recebimento de
          mensagens segue o fluxo Evolution → n8n → banco → Inbox; não usa estes
          destinos de saída.
        </p>
        {notice && (
          <p role="status" className="team-note">
            {notice}
          </p>
        )}
        <div className="actions webhook-save">
          <Button
            type="submit"
            disabled={!dirty || saving || isLoading || Boolean(loadError)}
          >
            <Save size={16} />
            Salvar webhooks
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || saving || isLoading || Boolean(loadError)}
            onClick={discard}
          >
            <RotateCcw size={15} />
            Descartar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
