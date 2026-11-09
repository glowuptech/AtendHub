"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
import { z } from "zod";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { useClients } from "@/features/clients/hooks";
import { useForms } from "../hooks";
import {
  Heading,
  Card,
  Denied,
  Badge,
  NavButton,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import {
  FieldSchema,
  FieldTypeSchema,
  type FieldType,
  type FormDefinition,
  type FormVersion,
  type FormStep,
  type CustomFieldDefinition,
} from "@/domain/schemas";
import { QuestionOptions } from "./question-options";
import { SettingsEditor } from "./settings-editor";
import { EditorAccordion } from "./editor-accordion";
import { FlowEditor } from "./flow-editor";
import { validateRouting } from "../services/routing";
import { settingsOf } from "../services/settings";
import { FormWizard } from "./wizard";
const typeLabels: Record<FieldType, string> = {
  short_text: "Texto curto",
  long_text: "Texto longo",
  phone: "Telefone",
  email: "E-mail",
  single_select: "Seleção única",
  image_choice: "Escolha por imagens",
  multi_select: "Múltipla seleção",
  date: "Data",
  boolean: "Sim / não",
  consent: "Aceite",
};
function newStep(fieldId: string, label: string, order: number): FormStep {
  return {
    id: crypto.randomUUID(),
    order,
    title: label,
    description: "",
    buttonLabel: "Continuar",
    actionId: crypto.randomUUID(),
    backActionId: crypto.randomUUID(),
    question: {
      id: crypto.randomUUID(),
      fieldDefinitionId: fieldId,
      label,
      required: true,
      pathIds: [],
      definesPath: false,
    },
  };
}
export function FormEditor({
  clientId: id,
  formId,
}: {
  clientId: string;
  formId?: string;
}) {
  const { setClientId } = useDemo();
  const {
    data: clients,
    isLoading: clientsLoading,
    error: clientsError,
  } = useClients();
  const {
    data: forms,
    isLoading: formsLoading,
    error: formsError,
  } = useForms(id);
  useEffect(() => {
    if (clients?.some((item) => item.id === id)) setClientId(id);
  }, [clients, id, setClientId]);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const client = clients?.find((item) => item.id === id);
  if (!mounted || clientsLoading || formsLoading)
    return <p role="status">Carregando cliente e formulários…</p>;
  if (clientsError)
    return (
      <p role="alert">
        Não foi possível consultar os clientes autorizados. Tente novamente.
      </p>
    );
  if (!client) return <Denied />;
  if (formsError)
    return (
      <p role="alert">
        Não foi possível consultar os formulários deste cliente.
      </p>
    );
  const source = formId ? forms?.find((form) => form.id === formId) : undefined;
  if (formId && !source) return <Denied />;
  return (
    <EditorWorkspace
      key={`${id}-${formId ?? "new"}`}
      client={client}
      source={source}
    />
  );
}
export function EditorWorkspace({
  source,
  client,
}: {
  source?: FormDefinition;
  client: import("@/domain/schemas").Client;
}) {
  const clientId = client.id;
  const [draft, setDraft] = useState<FormDefinition>(() => {
    if (source) {
      const f = structuredClone(source),
        v = f.versions.find((v) => v.id === f.activeVersionId)!;
      if (v.state === "snapshot") {
        const next = {
          ...structuredClone(v),
          id: crypto.randomUUID(),
          number: Math.max(...f.versions.map((v) => v.number)) + 1,
          state: "draft" as const,
          steps: v.steps.map((s) => ({
            ...s,
            id: crypto.randomUUID(),
            actionId: crypto.randomUUID(),
            backActionId: crypto.randomUUID(),
            question: { ...s.question, id: crypto.randomUUID() },
          })),
        };
        f.versions.push(next);
        f.activeVersionId = next.id;
      }
      f.status = "draft";
      return f;
    }
    const formId = crypto.randomUUID(),
      versionId = crypto.randomUUID();
    return {
      id: formId,
      organizationId: client.organizationId,
      clientId,
      doctorId: null,
      description: "",
      fields: [],
      name: "Novo formulário",
      slug: `formulario-${formId.slice(0, 8)}`,
      status: "draft",
      activeVersionId: versionId,
      versions: [
        {
          id: versionId,
          formId,
          organizationId: client.organizationId,
          clientId,
          number: 1,
          state: "draft",
          steps: [],
          paths: [],
          theme: client.branding,
          destination: "demo_success",
          settings: settingsOf(),
          successMessage: "Cadastro recebido! Em breve entraremos em contato.",
        },
      ],
    };
  });
  const fields = draft.fields;
  const [section, setSection] = useState("");
  const [activeStep, setActiveStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [persistedId, setPersistedId] = useState(source?.id ?? "");
  const [mode, setMode] = useState("new"),
    [selected, setSelected] = useState(""),
    [label, setLabel] = useState(""),
    [type, setType] = useState<FieldType>("short_text"),
    [options, setOptions] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState(false),
    [previewKey, setPreviewKey] = useState(0),
    [previewMode, setPreviewMode] = useState<"mobile" | "wide">("mobile");
  const version = draft.versions.find((v) => v.id === draft.activeVersionId)!;
  const frozen = version.state === "snapshot";
  function updateVersion(change: Partial<FormVersion>) {
    setSaved(false);
    setDraft((f) => ({
      ...f,
      versions: f.versions.map((v) =>
        v.id === f.activeVersionId ? { ...v, ...change } : v,
      ),
    }));
  }
  function updateStep(id: string, change: Partial<FormStep>) {
    updateVersion({
      steps: version.steps.map((s) => (s.id === id ? { ...s, ...change } : s)),
    });
  }
  async function save(snapshot = false) {
    if (saving) return;
    setSaving(true);
    try {
      if (snapshot) validateRouting(version, fields);
      const response = await fetch(
        persistedId ? `/api/forms/${persistedId}` : "/api/forms",
        {
          method: persistedId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, form: draft, publish: snapshot }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível salvar o formulário.",
        );
      setPersistedId(result.id);
      setDraft(result);
      setSaved(true);
      setNotice(
        snapshot
          ? "Formulário publicado. A versão anterior permanece preservada."
          : "Formulário salvo como rascunho.",
      );
    } catch (e) {
      setNotice(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "Verifique os campos.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow={client.name}
        title={source ? "Editor de formulário" : "Novo formulário"}
        description="Perguntas e respostas conectadas ao cadastro do cliente."
        action={
          <NavButton href={`/app/clientes/${clientId}/formularios`}>
            Voltar aos formulários
          </NavButton>
        }
      />
      <div className="actions editor-save-bar">
        <Button disabled={frozen || saving} onClick={() => save()}>
          {saving ? "Salvando…" : "Salvar rascunho"}
        </Button>
        <Button
          variant="outline"
          disabled={frozen || saving}
          onClick={() => save(true)}
        >
          Publicar formulário
        </Button>
        <span className="muted">
          {saved
            ? "Alterações salvas"
            : "Rascunho — salve para manter as alterações"}
        </span>
      </div>
      <p role="status" className="notice">
        {notice}
      </p>
      <div className={`editor-grid preview-${previewMode}`}>
        <div className="editor-fields">
          <EditorAccordion
            id="identity"
            number="01"
            title="Identidade"
            description="Nome, link e profissional"
            color="#2563eb"
            open={section === "identity"}
            onToggle={() =>
              setSection(section === "identity" ? "" : "identity")
            }
          >
            {" "}
            <div id="editor-identity">
              <Card title="Identidade e destino">
                <label>
                  Profissional vinculado
                  <select
                    disabled={frozen}
                    value={draft.doctorId ?? ""}
                    onChange={(e) => {
                      setSaved(false);
                      setDraft({ ...draft, doctorId: e.target.value || null });
                    }}
                  >
                    <option value="">
                      Todos / sem profissional específico
                    </option>
                    {client.doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome do formulário
                  <input
                    disabled={frozen}
                    value={draft.name}
                    onChange={(e) => {
                      setSaved(false);
                      setDraft({ ...draft, name: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Slug
                  <input
                    disabled={frozen}
                    value={draft.slug}
                    onChange={(e) => {
                      setSaved(false);
                      setDraft({ ...draft, slug: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Mensagem de conclusão
                  <input
                    disabled={frozen}
                    value={version.successMessage}
                    onChange={(e) =>
                      updateVersion({ successMessage: e.target.value })
                    }
                  />
                </label>
                <Badge>
                  Versão {version.number} · {frozen ? "ativa" : "rascunho"}
                </Badge>
              </Card>
            </div>
          </EditorAccordion>
          <EditorAccordion
            id="presentation"
            number="02"
            title="Apresentação"
            description="Tela inicial, texto e botão de início"
            color="#7c3aed"
            open={section === "presentation"}
            onToggle={() =>
              setSection(section === "presentation" ? "" : "presentation")
            }
          >
            <SettingsEditor
              value={version.settings}
              onChange={(settings) => updateVersion({ settings })}
              disabled={frozen}
              section="presentation"
            />
          </EditorAccordion>
          <EditorAccordion
            id="contacts"
            number="03"
            title="Contatos"
            description="Nome, telefone e e-mail"
            color="#0f766e"
            open={section === "contacts"}
            onToggle={() =>
              setSection(section === "contacts" ? "" : "contacts")
            }
          >
            <SettingsEditor
              value={version.settings}
              onChange={(settings) => updateVersion({ settings })}
              disabled={frozen}
              section="contacts"
            />
          </EditorAccordion>
          <EditorAccordion
            id="appearance"
            number="04"
            title="Aparência"
            description="Cores, fonte e imagem de fundo"
            color="#b45309"
            open={section === "appearance"}
            onToggle={() =>
              setSection(section === "appearance" ? "" : "appearance")
            }
          >
            <SettingsEditor
              value={version.settings}
              onChange={(settings) => updateVersion({ settings })}
              disabled={frozen}
              section="appearance"
            />
          </EditorAccordion>
          <EditorAccordion
            id="flow"
            number="05"
            title="Caminhos"
            description="Direcionamento conforme a resposta"
            color="#be185d"
            open={section === "flow"}
            onToggle={() => setSection(section === "flow" ? "" : "flow")}
          >
            {" "}
            <fieldset disabled={frozen} className="flow-editor-shell">
              <FlowEditor
                version={version}
                fields={fields}
                onChange={(next, nextFields) => {
                  setSaved(false);
                  setDraft((current) => ({
                    ...current,
                    fields: nextFields,
                    versions: current.versions.map((v) =>
                      v.id === current.activeVersionId ? next : v,
                    ),
                  }));
                }}
              />
            </fieldset>
          </EditorAccordion>
          <EditorAccordion
            id="questions"
            number="06"
            title="Perguntas"
            description="Adicionar, editar e ordenar perguntas"
            color="#4338ca"
            open={section === "questions"}
            onToggle={() =>
              setSection(section === "questions" ? "" : "questions")
            }
          >
            {" "}
            <div id="editor-questions">
              <Card title="Etapas e perguntas">
                {!version.steps.length && (
                  <p>Adicione a primeira pergunta abaixo.</p>
                )}
                <p className="muted">
                  Edite uma pergunta por vez. Configure os desvios somente em
                  Caminhos.
                </p>
                {version.steps.map((s, i) => (
                  <details
                    className="question-editor-item"
                    key={s.id}
                    open={activeStep === s.id}
                  >
                    <summary
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveStep(activeStep === s.id ? "" : s.id);
                      }}
                    >
                      {i + 1}. {s.question.label || "Pergunta sem título"}
                      <span className="muted">
                        {s.question.definesPath
                          ? "Escolhe o caminho"
                          : s.question.pathIds.length
                            ? s.question.pathIds
                                .map(
                                  (id) =>
                                    version.paths.find((p) => p.id === id)
                                      ?.name ?? "Caminho inválido",
                                )
                                .join(", ")
                            : "Comum a todos"}
                      </span>
                    </summary>
                    <fieldset
                      className="step-editor"
                      key={s.id}
                      disabled={frozen}
                    >
                      <legend>Editar pergunta {i + 1}</legend>
                      <label>
                        Pergunta
                        <input
                          value={s.question.label}
                          onChange={(e) =>
                            updateStep(s.id, {
                              question: {
                                ...s.question,
                                label: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      {fields.find(
                        (f) => f.id === s.question.fieldDefinitionId,
                      ) && (
                        <QuestionOptions
                          key={s.question.fieldDefinitionId}
                          field={fields.find(
                            (f) => f.id === s.question.fieldDefinitionId,
                          )!}
                          onSave={(field) => {
                            setSaved(false);
                            setDraft((current) => ({
                              ...current,
                              fields: current.fields.map((item) =>
                                item.id === field.id ? field : item,
                              ),
                            }));
                          }}
                        />
                      )}
                      <details>
                        <summary>Texto de apoio, botão e evento</summary>
                        <label>
                          Descrição
                          <input
                            value={s.description}
                            onChange={(e) =>
                              updateStep(s.id, { description: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Rótulo do botão
                          <input
                            value={s.buttonLabel}
                            onChange={(e) =>
                              updateStep(s.id, { buttonLabel: e.target.value })
                            }
                          />
                        </label>

                        <label>
                          Evento Meta desta etapa (opcional)
                          <input
                            placeholder="Ex.: EtapaCincoConcluida"
                            value={s.metaEvent ?? ""}
                            onChange={(e) =>
                              updateStep(s.id, { metaEvent: e.target.value })
                            }
                          />
                        </label>
                      </details>
                      <label className="check-option">
                        <input
                          type="checkbox"
                          checked={s.question.required}
                          onChange={(e) =>
                            updateStep(s.id, {
                              question: {
                                ...s.question,
                                required: e.target.checked,
                              },
                            })
                          }
                        />
                        Obrigatória
                      </label>
                      <div className="actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Mover etapa ${i + 1} para cima`}
                          disabled={i === 0}
                          onClick={() => {
                            const steps = [...version.steps];
                            [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                            updateVersion({
                              steps: steps.map((s, j) => ({ ...s, order: j })),
                            });
                          }}
                        >
                          <ArrowUp size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Mover etapa ${i + 1} para baixo`}
                          disabled={i === version.steps.length - 1}
                          onClick={() => {
                            const steps = [...version.steps];
                            [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                            updateVersion({
                              steps: steps.map((s, j) => ({ ...s, order: j })),
                            });
                          }}
                        >
                          <ArrowDown size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover etapa ${i + 1}`}
                          onClick={() =>
                            updateVersion({
                              steps: version.steps
                                .filter((t) => t.id !== s.id)
                                .map((s, j) => ({ ...s, order: j })),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </fieldset>
                  </details>
                ))}
              </Card>
              <Card title="Adicionar pergunta">
                <fieldset disabled={frozen}>
                  <details>
                    <summary>Avançado: reutilizar campo existente</summary>
                    <label>
                      Vínculo com o catálogo
                      <select
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value);
                          setConfirmed(false);
                        }}
                      >
                        <option value="reuse">
                          Reutilizar definição existente
                        </option>
                        <option value="new">Criar nova definição</option>
                      </select>
                    </label>
                  </details>
                  {mode === "reuse" ? (
                    <>
                      <label>
                        Campo desta clínica
                        <select
                          value={selected}
                          onChange={(e) => {
                            setSelected(e.target.value);
                            setConfirmed(false);
                          }}
                        >
                          <option value="">Selecione um campo</option>
                          {fields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label} · {f.stableKey}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-option">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        Confirmo a reutilização deste campo no mesmo cliente.
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Nome do campo
                        <input
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                        />
                      </label>
                      <label>
                        Tipo
                        <select
                          value={type}
                          onChange={(e) => setType(e.target.value as FieldType)}
                        >
                          {FieldTypeSchema.options.map((t) => (
                            <option value={t} key={t}>
                              {typeLabels[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {[
                        "single_select",
                        "image_choice",
                        "multi_select",
                      ].includes(type) && (
                        <label>
                          Opções, uma por linha
                          <textarea
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                          />
                        </label>
                      )}
                    </>
                  )}
                  <Button
                    disabled={mode === "reuse" && (!confirmed || !selected)}
                    onClick={() => {
                      try {
                        let field: CustomFieldDefinition;
                        if (mode === "reuse") {
                          if (!confirmed)
                            throw Error("Confirme a reutilização");
                          field =
                            fields.find((item) => item.id === selected) ??
                            (() => {
                              throw Error("Campo não encontrado.");
                            })();
                        } else {
                          field = FieldSchema.parse({
                            id: crypto.randomUUID(),
                            organizationId: client.organizationId,
                            clientId,
                            stableKey: `campo_${crypto.randomUUID().replaceAll("-", "")}`,
                            label,
                            type,
                            sensitivity: "ordinary",
                            options: (
                              options ||
                              ([
                                "single_select",
                                "image_choice",
                                "multi_select",
                              ].includes(type)
                                ? "Opção 1\nOpção 2"
                                : "")
                            )
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((s, i) => ({
                                id: `option-${i + 1}`,
                                label: s,
                              })),
                          });
                        }
                        if (
                          version.steps.some(
                            (s) => s.question.fieldDefinitionId === field.id,
                          )
                        )
                          throw Error("Este campo já está no formulário");
                        const step = newStep(
                          field.id,
                          field.label,
                          version.steps.length,
                        );
                        setSaved(false);
                        setDraft((current) => ({
                          ...current,
                          fields: current.fields.some((f) => f.id === field.id)
                            ? current.fields
                            : [...current.fields, field],
                          versions: current.versions.map((v) =>
                            v.id === current.activeVersionId
                              ? { ...v, steps: [...v.steps, step] }
                              : v,
                          ),
                        }));
                        setActiveStep(step.id);
                        setLabel("");
                        setOptions("");
                        setNotice(
                          "Pergunta adicionada. Edite as opções acima; os caminhos ficam em Caminhos.",
                        );
                        setConfirmed(false);
                      } catch (e) {
                        setNotice(
                          e instanceof z.ZodError
                            ? e.issues[0].message
                            : e instanceof Error
                              ? e.message
                              : "Verifique o campo",
                        );
                      }
                    }}
                  >
                    <Plus size={16} />
                    Adicionar pergunta
                  </Button>
                </fieldset>
              </Card>
            </div>
          </EditorAccordion>
          <EditorAccordion
            id="tracking"
            number="07"
            title="Eventos e integrações"
            description="Pixel e configurações avançadas"
            color="#475569"
            open={section === "tracking"}
            onToggle={() =>
              setSection(section === "tracking" ? "" : "tracking")
            }
          >
            <SettingsEditor
              value={version.settings}
              onChange={(settings) => updateVersion({ settings })}
              disabled={frozen}
              section="tracking"
            />
          </EditorAccordion>
          {saved && frozen && (
            <NavButton href={`/f/${draft.slug}`}>
              Abrir formulário ativo
            </NavButton>
          )}
          {saved && (
            <NavButton
              href={`/app/clientes/${clientId}/formularios/${draft.id}/preview`}
            >
              Abrir prévia salva
            </NavButton>
          )}
        </div>
        <aside className="editor-preview">
          <div className="section-caption">
            <strong>Prévia mobile</strong>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewKey((k) => k + 1)}
            >
              Atualizar prévia
            </Button>
          </div>
          <div
            className="preview-device-controls"
            aria-label="Tamanho da prévia"
          >
            <Button
              size="sm"
              variant={previewMode === "mobile" ? "default" : "ghost"}
              aria-pressed={previewMode === "mobile"}
              onClick={() => setPreviewMode("mobile")}
            >
              Celular
            </Button>
            <Button
              size="sm"
              variant={previewMode === "wide" ? "default" : "ghost"}
              aria-pressed={previewMode === "wide"}
              onClick={() => setPreviewMode("wide")}
            >
              Ampliada
            </Button>
          </div>
          <div className="phone-frame">
            <FormWizard
              key={`${previewKey}-${settingsOf(version.settings).introduction.mode}-${version.steps.map((s) => s.id).join()}`}
              compact
              form={draft}
              version={version}
              fields={fields}
              clinicName={client.name}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
