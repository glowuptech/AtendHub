"use client";
import { useState } from "react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Denied,
  DemoNotice,
} from "@/components/layout/shared";
import { FormWizard } from "./wizard";
import { demoScope } from "@/lib/mocks/fixtures";
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
        <NavButton href={`/f/${form.slug}`}>Abrir rota pública DEMO</NavButton>
      </div>
    </>
  );
}
export function PublicForm({ slug }: { slug: string }) {
  const { repositories } = useDemo();
  const form = repositories.clients
    .list(demoScope)
    .flatMap((c) => repositories.forms.list(c.id))
    .find((f) => f.slug === slug && f.status !== "archived");
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
        form={form}
        version={form.versions.find((v) => v.id === form.activeVersionId)!}
        fields={repositories.fields.list(form.clientId)}
        clinicName={repositories.clients.get(form.clientId).name}
      />
      <p className="public-caption">
        Prescrita · Tecnologia para um atendimento mais humano.
      </p>
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
  const a = repositories.analytics.get(id, form.id, version.id);
  const base = `/app/clientes/${id}/formularios/${form.id}`;
  if (tracking)
    return (
      <>
        <Heading
          eyebrow={repositories.clients.get(id).name}
          title="Mensuração com responsabilidade."
          description={`${form.name} · configuração demonstrativa`}
        />
        <Card title="Meta Pixel e CAPI">
          <Badge tone="warning">Desativados por padrão</Badge>
          <p>
            Nenhum script, token ou evento de publicidade é carregado nesta
            entrega.
          </p>
          <label className="check-option">
            <input type="checkbox" disabled checked={false} readOnly />
            Ativar Meta · indisponível em C1
          </label>
          <p>
            PageView padrão não é visita qualificada. engaged_10s é uma métrica
            interna de dez segundos cumulativos de página visível e ativa.
          </p>
          <p>
            Ativação futura depende de finalidade, consentimento aplicável e
            revisão das políticas de saúde. Respostas, especialidades e
            identificadores de pacientes nunca compõem eventos de marketing.
          </p>
        </Card>
        <Card title="Analytics internos">
          <p>
            Eventos estritamente tipados e sem respostas, nome, telefone ou
            texto livre. O recorder da prévia fica somente em memória; os totais
            de analytics são fixtures independentes.
          </p>
          <p>
            Abandono será estimado após timeout de sessão. Fechar uma aba não
            significa abandono confirmado.
          </p>
          <NavButton href={`${base}/analytics`}>
            Ver funil demonstrativo
          </NavButton>
        </Card>
      </>
    );
  return (
    <>
      <Heading
        eyebrow={repositories.clients.get(id).name}
        title="Do primeiro olhar ao envio."
        description={`${form.name} · analytics internos fictícios, independentes da prévia.`}
        action={<NavButton href={`${base}/tracking`}>Mensuração</NavButton>}
      />
      <div className="toolbar">
        <Badge>Simulação · 01–03/11/2026 · America/Sao_Paulo</Badge>
        <label className="push-right">
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
      </div>
      <div className="metrics">
        {[
          [
            "Sessões abertas",
            a.views,
            `${a.views} sessões elegíveis · form_view`,
          ],
          [
            "Engajamento 10 s",
            a.views ? `${Math.round((a.engaged / a.views) * 100)}%` : "N/D",
            `${a.engaged} / ${a.views} sessões · engaged_10s`,
          ],
          [
            "Submissões",
            a.views ? `${Math.round((a.submissions / a.views) * 100)}%` : "N/D",
            `${a.submissions} / ${a.views} sessões · form_submitted`,
          ],
          [
            "Abandono estimado",
            a.views ? `${a.abandoned}%` : "N/D",
            `${a.abandoned} / ${a.views} sessões expiradas sem envio`,
          ],
        ].map(([label, value, context]) => (
          <Card key={label} title={String(label)}>
            <strong className="metric-value">{value}</strong>
            <small>{context}</small>
          </Card>
        ))}
      </div>
      <Card title="Alcance e conclusão por etapa">
        <p className="muted">
          Sessões únicas por versão. No exemplo, 100 abriram, 55 chegaram à
          etapa 3 e 38 enviaram.
        </p>
        {a.steps.map((s, i) => (
          <div className="funnel-row" data-series={i % 5} key={s.stepId}>
            <div>
              <strong>
                {i + 1}. {version.steps[i].title}
              </strong>
              <span>
                {s.viewed} / {a.views} sessões alcançaram
              </span>
            </div>
            <div className="bar-track">
              <span
                style={{
                  width: `${a.views ? (s.viewed / a.views) * 100 : 0}%`,
                }}
              />
            </div>
            <small>
              step_completed: {s.completed}/{s.viewed} · abandono estimado:{" "}
              {s.abandoned}/{s.viewed} · step_view: {s.viewed} sessões
            </small>
          </div>
        ))}
      </Card>
      <div className="cards-grid">
        <Card title="Interações e validação">
          <p>
            action_clicked: {a.actions} eventos / {a.views} sessões.
          </p>
          <p>
            form_validation_failed: {a.validationErrors} eventos / {a.views}{" "}
            sessões.
          </p>
          <small>
            Eventos podem ocorrer várias vezes por sessão. Não equivalem a
            pessoas identificadas.
          </small>
        </Card>
        <Card title="Limites da mensuração">
          <p>
            form_abandoned: estimativa após 30 minutos de timeout ilustrativo.
            Não é disparado ao fechar a aba.
          </p>
          <p>
            Bloqueadores, consentimento e falhas de conectividade podem limitar
            cobertura futura. Não há tráfego real aqui.
          </p>
        </Card>
      </div>
    </>
  );
}
