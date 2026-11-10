"use client";
import { useState } from "react";
import useSWR from "swr";
import { useDemo } from "@/components/layout/demo-context";
import { useClients } from "@/features/clients/hooks";
import { useForms } from "../hooks";
import {
  Heading,
  Card,
  NavButton,
  Denied,
} from "@/components/layout/shared";
import { settingsOf } from "../services/settings";
import { FormWizard, type WizardCapture } from "./wizard";

export function FormPreview({
  clientId: id,
  formId,
}: {
  clientId: string;
  formId: string;
}) {
  const { clientId } = useDemo();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: forms, isLoading: formsLoading } = useForms(id);
  if (clientsLoading || formsLoading) return <p role="status">Carregando prévia…</p>;
  if (id !== clientId) return <Denied />;
  const form = forms?.find((item) => item.id === formId);
  const client = clients?.find((item) => item.id === id);
  if (!form || !client) return <Denied />;
  const version = form.versions.find((item) => item.id === form.activeVersionId) ?? form.versions.at(-1);
  if (!version) return <Denied />;
  return <><Heading title="Prévia do formulário" description={`${client.name} · persistido no Supabase.`} action={<NavButton href={`/app/clientes/${id}/formularios`}>Voltar</NavButton>} /><div className="preview-center"><FormWizard form={form} version={version} fields={form.fields ?? []} clinicName={client.name} /></div><div className="preview-center"><p>O formulário público ainda não está conectado ao fluxo persistido.</p></div></>;
}
const publicFetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Formulário indisponível.");
  return body;
};

export function PublicForm({ slug }: { slug: string }) {
  const { data: form, error, isLoading } = useSWR(`/api/public/forms/${encodeURIComponent(slug)}`, publicFetcher, {
    revalidateOnFocus: false,
  });
  const [sessionId] = useState(() => crypto.randomUUID());
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  if (isLoading) return <main className="public-page"><p role="status">Carregando formulário…</p></main>;
  if (error || !form) return <main className="public-page"><Denied /></main>;
  const version = form.versions.find((item: { id: string }) => item.id === form.activeVersionId);
  if (!version) return <main className="public-page"><Denied /></main>;
  const sendEvent = (eventType: "view" | "action", actionId?: string) => {
    void fetch(`/api/public/forms/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType, actionId, sessionId }),
      keepalive: true,
    });
  };
  const capture: WizardCapture = {
    progress: () => null,
    view: (input) => sendEvent("view", input.sessionId),
    action: (_input, actionId) => sendEvent("action", actionId),
    capture: (input) => {
      void fetch(`/api/public/forms/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, sessionId, idempotencyKey }),
        keepalive: true,
      });
      return sessionId;
    },
  };
  return (
    <main className="public-page">
      <FormWizard
        live
        form={form}
        version={version}
        fields={form.fields ?? []}
        clinicName={form.clinicName ?? form.name}
        captureRepository={capture}
      />
    </main>
  );
}
export function FormAnalytics({
  clientId: id,
  formId,
  tracking = false,
}: {
  clientId: string;
  formId: string;
  tracking?: boolean;
}) {
  const { repositories, clientId } = useDemo();
  const [selected, setSelected] = useState("");
  if (id !== clientId) return <Denied />;
  const form = repositories.forms.list(id).find((f) => f.id === formId);
  if (!form) return <Denied />;
  const version =
    form.versions.find((v) => v.id === selected) ??
    form.versions.find((v) => v.id === form.activeVersionId)!;
  const a = repositories.capture.stats(id, form.id, version.id);
  const base = `/app/clientes/${id}/formularios/${form.id}`;
  if (tracking)
    return (
      <>
        <Heading title="Eventos e notificações" description={form.name} />
        <Card title="Configuração de mensuração">
          <p>
            PageView após {settingsOf(version.settings).tracking.viewSeconds}{" "}
            segundos visíveis. Abandono após{" "}
            {settingsOf(version.settings).tracking.abandonMinutes} minutos sem
            avanço.
          </p>
          <p>
            Meta Pixel:{" "}
            {settingsOf(version.settings).tracking.pixelId || "Não configurado"}
          </p>
          <NavButton href={`${base}/editar`}>Editar configurações</NavButton>
        </Card>
        <Card title="Eventos de etapas">
          <p>
            {
              repositories.capture
                .listActions(id)
                .filter((e) => e.formId === formId).length
            }{" "}
            avanços registrados
          </p>
          {repositories.capture
            .listActions(id)
            .filter((e) => e.formId === formId)
            .map((e) => (
              <p key={e.eventId}>
                {e.eventName} · ação {e.actionId.slice(-8)}
              </p>
            ))}
        </Card>
        <Card title="Fila de notificações">
          <p>Eventos locais aguardando a futura conexão ao n8n.</p>
          {repositories.capture
            .listEvents(id)
            .filter((e) => e.formId === formId)
            .map((e) => (
              <p key={e.id}>
                {e.eventType} · {new Date(e.occurredAt).toLocaleString("pt-BR")}{" "}
                · pendente
              </p>
            ))}
        </Card>
        <Card title="Eventos preparados para Meta">
          <p>Nenhum envio externo nesta fase.</p>
          {repositories.capture
            .listMarketing(id)
            .filter((e) => e.formId === formId)
            .map((e) => (
              <p key={e.eventId}>
                {e.eventName} · {e.eventId.slice(-8)}
              </p>
            ))}
        </Card>
      </>
    );
  return (
    <>
      <Heading title="Resultados do formulário" description={form.name} />
      <label>
        Versão
        <select
          value={version.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {form.versions.map((v) => (
            <option key={v.id} value={v.id}>
              Versão {v.number}
            </option>
          ))}
        </select>
      </label>
      <div className="metrics">
        {[
          ["Visualizações válidas", a.views],
          ["Cadastros concluídos", a.completed],
          ["Cadastros incompletos", a.incomplete],
          [
            "Conversão das visitas válidas",
            a.views
              ? `${Math.round((a.qualifiedCompleted / a.views) * 100)}%`
              : "—",
          ],
        ].map(([label, value]) => (
          <Card key={label} title={String(label)}>
            <strong className="metric-value">{value}</strong>
          </Card>
        ))}
      </div>
      <Card title="Conclusão por pergunta">
        {version.steps.map((step, i) => {
          const total = repositories.capture
            .listActions(id)
            .filter(
              (e) => e.formId === formId && e.actionId === step.actionId,
            ).length;
          return (
            <div className="profile-stat-row" key={step.id}>
              <span>
                {i + 1}. {step.question.label}
              </span>
              <strong>{total} avanços</strong>
            </div>
          );
        })}
      </Card>
      <p>
        Visualizações exigem {settingsOf(version.settings).tracking.viewSeconds}{" "}
        segundos visíveis. Cadastros concluídos antes desse prazo são
        preservados, mas não entram na conversão das visitas válidas.
      </p>
      <NavButton href={`${base}/tracking`}>
        Ver eventos e notificações
      </NavButton>
    </>
  );
}
