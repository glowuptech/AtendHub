"use client";
import { useState } from "react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  NavButton,
  Denied,
  DemoNotice,
} from "@/components/layout/shared";
import { settingsOf } from "../services/settings";
import { FormWizard } from "./wizard";

export function FormPreview({
  clientId: id,
  formId,
}: {
  clientId: string;
  formId: string;
}) {
  const { repositories, clientId } = useDemo();
  if (id !== clientId) return <Denied />;
  const form = repositories.forms.list(id).find((f) => f.id === formId);
  if (!form) return <Denied />;
  return (
    <>
      <Heading
        title="Prévia do formulário"
        description={`${repositories.clients.get(id).name} · não publicado.`}
        action={
          <NavButton href={`/app/clientes/${id}/formularios`}>Voltar</NavButton>
        }
      />
      <div className="preview-center">
        <FormWizard
          form={form}
          version={form.versions.find((v) => v.id === form.activeVersionId)!}
          fields={repositories.fields.list(id)}
          clinicName={repositories.clients.get(id).name}
        />
      </div>
      <div className="preview-center">
        <NavButton href={`/f/${form.slug}`}>Abrir rota pública</NavButton>
      </div>
    </>
  );
}
export function PublicForm({ slug }: { slug: string }) {
  const { scope, repositories } = useDemo();
  const form = repositories.clients
    .list(scope)
    .flatMap((c) => repositories.forms.list(c.id))
    .find(
      (f) =>
        f.slug === slug &&
        f.status !== "archived" &&
        f.versions.find((v) => v.id === f.activeVersionId)?.state ===
          "snapshot" &&
        settingsOf(f.versions.find((v) => v.id === f.activeVersionId)?.settings)
          .enabled,
    );
  if (!form)
    return (
      <main>
        <Denied />
      </main>
    );
  return (
    <main className="public-page">
      <DemoNotice />
      <FormWizard
        live
        form={form}
        version={form.versions.find((v) => v.id === form.activeVersionId)!}
        fields={repositories.fields.list(form.clientId)}
        clinicName={repositories.clients.get(form.clientId).name}
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
