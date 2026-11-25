import type { FormVersion } from "@/domain/schemas";
import { Card } from "@/components/layout/shared";
import { questionStage, standardButtonEvents } from "../services/button-events";
import { settingsOf, type FormSettings } from "../services/settings";

export function ButtonEventsEditor({
  version,
  disabled,
  onSettings,
  onStepEvent,
}: {
  version: FormVersion;
  disabled: boolean;
  onSettings: (settings: FormSettings) => void;
  onStepEvent: (stepId: string, name: string) => void;
}) {
  const settings = settingsOf(version.settings);
  const { tracking, introduction } = settings;
  const buttons = tracking.buttonEvents ?? {};
  const hasIntro = introduction.mode === "separate";
  const hasContacts = Object.values(settings.contacts).some(
    (field) => field.enabled,
  );
  const stages = version.steps.map((step) => ({
    stage: questionStage(step),
    label: step.question.label,
    step,
  }));
  const rows: {
    stage: string;
    label: string;
    step?: FormVersion["steps"][number];
  }[] = [...stages];
  if (hasContacts) {
    const contacts = { stage: "contato", label: "Dados de contato" };
    if (settings.contactPosition === "start") rows.unshift(contacts);
    else rows.push(contacts);
  }

  function input(
    action: string,
    label: string,
    step?: FormVersion["steps"][number],
  ) {
    const name = step ? (step.metaEvent ?? "") : (buttons[action] ?? "");
    return (
      <div key={action}>
        <label>
          {label}
          <input
            list="meta-button-events"
            value={name}
            maxLength={40}
            placeholder="Selecione ou escreva um evento"
            onChange={(event) => {
              const value = event.target.value;
              if (step) onStepEvent(step.id, value);
              else
                onSettings({
                  ...settings,
                  tracking: {
                    ...tracking,
                    buttonEvents: { ...buttons, [action]: value },
                  },
                });
            }}
          />
          {name &&
            (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ||
              ["PageView", "Lead"].includes(name)) && (
              <small role="alert">
                Use um nome que comece com letra e contenha letras, números ou
                sublinhado. PageView e Lead têm configuração própria.
              </small>
            )}
        </label>
        <small>
          Regra de URL · <code>acao={action}</code>
        </small>
      </div>
    );
  }

  return (
    <fieldset disabled={disabled}>
      <Card title="Eventos por botão">
        <p>
          Escolha um evento padrão da Meta ou dê um nome ao seu evento
          personalizado. Deixe o campo vazio para desativá-lo.
        </p>
        <datalist id="meta-button-events">
          {standardButtonEvents.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {hasIntro && input("iniciar", introduction.buttonLabel)}
        {rows.map(({ stage, label, step }, i) => (
          <fieldset key={stage}>
            <legend>{label}</legend>
            {input(
              `avancar-${stage}`,
              i === rows.length - 1
                ? "Enviar cadastro"
                : step?.buttonLabel || "Continuar",
              step,
            )}
            {i > 0 && input(`voltar-${stage}`, "Voltar")}
            {hasIntro && i > 0 && input(`apresentar-${stage}`, "Apresentação")}
          </fieldset>
        ))}
        <label>
          <input
            type="checkbox"
            checked={tracking.trackStageUrls ?? false}
            onChange={(e) =>
              onSettings({
                ...settings,
                tracking: { ...tracking, trackStageUrls: e.target.checked },
              })
            }
          />
          Enviar EtapaFormulario para medir a navegação por URL
        </label>
        <p>
          O link público identifica a tela em “etapa” e o botão em “acao”. Use
          esses parâmetros nas regras de URL da Meta.
        </p>
      </Card>
    </fieldset>
  );
}
