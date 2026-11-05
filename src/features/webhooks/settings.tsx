"use client";
import { useState } from "react";
import { Webhook, Save, RotateCcw } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/layout/shared";
import { WebhookConfigSchema, webhookDestinations } from "./config";
export function WebhookSettings() {
  const { webhookConfig, setWebhookConfig } = useDemo();
  const [draft, setDraft] = useState(() => ({ ...webhookConfig })),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = webhookDestinations.some(
    ({ id }) => draft[id] !== webhookConfig[id],
  );
  function discard() {
    setDraft({ ...webhookConfig });
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
          {webhookDestinations.filter(({ id }) => !!webhookConfig[id]).length}{" "}
          de {webhookDestinations.length} URLs cadastradas
        </Badge>
      </div>
      <p className="team-note">
        URLs salvas em memória nesta sessão. Cadastrar um destino não ativa os
        envios nem altera variáveis de ambiente do v0. A conexão com o servidor
        será feita na próxima etapa.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
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
          setWebhookConfig(parsed.data);
          setDraft(parsed.data);
          setErrors({});
          setNotice("Webhooks salvos nesta sessão. Nenhum evento foi enviado.");
        }}
      >
        {webhookDestinations.map(({ id, title, description, events }) => (
          <fieldset className="webhook-destination" key={id}>
            <legend>{title}</legend>
            <div className="webhook-caption">
              <Webhook size={17} aria-hidden="true" />
              <Badge>
                {webhookConfig[id] ? "URL cadastrada" : "Não configurado"}
              </Badge>
              {draft[id] !== webhookConfig[id] && (
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
          <Button type="submit" disabled={!dirty}>
            <Save size={16} />
            Salvar webhooks
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dirty}
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
