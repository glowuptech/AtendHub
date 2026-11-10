"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { ArrowRight, Check } from "lucide-react";
import {
  type FormDefinition,
  type FormVersion,
  type CustomFieldDefinition,
  type FieldValue,
  validateAnswer,
} from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { FieldInput } from "./field-input";
import { settingsOf } from "../services/settings";
import { eligibleSteps } from "../services/routing";
import { useDemo } from "@/components/layout/demo-context";
export function FormWizard({
  form,
  version,
  fields,
  clinicName,
  compact = false,
  live = false,
  onBackgroundImageError,
  onBackgroundImageLoad,
}: {
  form: FormDefinition;
  version: FormVersion;
  fields: CustomFieldDefinition[];
  clinicName: string;
  compact?: boolean;
  live?: boolean;
  onBackgroundImageError?: () => void;
  onBackgroundImageLoad?: () => void;
}) {
  const { repositories, refresh } = useDemo();
  const settings = settingsOf(version.settings);
  const progress = live
    ? repositories.capture.progress(form.clientId, form.id, version.id)
    : null;
  const [index, setIndex] = useState(progress?.nextIndex ?? 0),
    [answers, setAnswers] = useState<Record<string, FieldValue>>(
      progress?.answers ?? {},
    ),
    [contacts, setContacts] = useState(
      progress?.contacts ?? { name: "", phone: "", email: "" },
    ),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [savedPartial, setSavedPartial] = useState(Boolean(progress)),
    [introSeen, setIntroSeen] = useState(
      settings.introduction.mode !== "separate",
    );
  const session = useRef(progress?.sessionId ?? "");
  const heading = useRef<HTMLHeadingElement>(null);
  const submitted = useRef(false);
  const hasContacts = Object.values(settings.contacts).some((c) => c.enabled);
  const routedSteps = eligibleSteps(version, fields, answers);
  const sequence = [
    ...(hasContacts && settings.contactPosition === "start"
      ? ["contacts"]
      : []),
    ...routedSteps.map((s) => s.id),
    ...(hasContacts && settings.contactPosition === "end" ? ["contacts"] : []),
  ];
  const current = sequence[index];
  const step = version.steps.find((s) => s.id === current);
  const field = fields.find((f) => f.id === step?.question.fieldDefinitionId);
  const isLast = index === sequence.length - 1;
  const base = () => ({
    clientId: form.clientId,
    formId: form.id,
    versionId: version.id,
    sessionId: session.current,
  });
  useEffect(() => {
    if (!session.current) session.current = crypto.randomUUID();
    let elapsed = 0,
      last = performance.now(),
      counted = false;
    const timer = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible")
        elapsed += Math.min(now - last, 500);
      last = now;
      if (live && !counted && elapsed >= settings.tracking.viewSeconds * 1000) {
        counted = true;
        try {
          repositories.capture.view({
            clientId: form.clientId,
            formId: form.id,
            versionId: version.id,
            sessionId: session.current,
          });
          refresh();
        } catch {
          /* Archived forms do not receive views. */
        }
      }
    }, 250);
    return () => clearInterval(timer);
    // A visit remains stable across context refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, version.id, live, settings.tracking.viewSeconds]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index, done]);
  const appearance = settings.appearance;
  const introVisible = settings.introduction.mode === "separate" && !introSeen;
  const style = {
    "--form-primary": appearance.primary,
    "--form-button": appearance.button,
    "--form-button-text": appearance.buttonText,
    "--form-bg": appearance.background,
    "--form-panel-opacity": appearance.panelOpacity / 100,
    "--form-overlay": appearance.overlay,
    "--form-overlay-opacity": appearance.overlayOpacity / 100,
    "--form-text": appearance.text,
    "--form-border": appearance.border,
    "--choice-bg": appearance.optionBackground,
    "--choice-text": appearance.optionText,
    "--choice-selected-bg": appearance.optionSelectedBackground,
    "--choice-selected-text": appearance.optionSelectedText,
    "--form-radius": `${appearance.radius}px`,
    "--intro-align": settings.introduction.align,
    "--intro-items": {
      left: "flex-start",
      center: "center",
      right: "flex-end",
    }[settings.introduction.align],
    "--intro-vertical": {
      top: "flex-start",
      center: "center",
      bottom: "flex-end",
    }[settings.introduction.vertical],
    "--intro-width": `${settings.introduction.maxWidth}px`,
    fontFamily:
      appearance.font === "system"
        ? "ui-sans-serif, system-ui, sans-serif"
        : `"${appearance.font}", ${["Georgia", "Palatino"].includes(appearance.font) ? "serif" : "sans-serif"}`,
  } as CSSProperties;
  const validateContacts = () => {
    for (const k of ["name", "phone", "email"] as const) {
      const c = settings.contacts[k],
        v = contacts[k].trim();
      if (!c.enabled) continue;
      if (c.required && !v) throw Error(`Preencha ${c.label}`);
      if (v && k === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        throw Error("Informe um e-mail válido");
      if (v && k === "phone" && !/^\+?[\d ()-]{8,25}$/.test(v))
        throw Error("Informe um telefone válido");
    }
  };
  return (
    <section
      className={`form-experience ${compact ? "compact" : ""}`}
      style={style}
    >
      {appearance.backgroundImage && (
        <img
          className="form-background-layer"
          src={appearance.backgroundImage}
          alt=""
          aria-hidden="true"
          decoding="async"
          onLoad={onBackgroundImageLoad}
          onError={onBackgroundImageError}
        />
      )}
      <div className="form-overlay-layer" aria-hidden="true" />
      <div className="form-sheet">
        {appearance.cover && (
          <img className="form-cover" src={appearance.cover} alt="" />
        )}
        {introVisible && (
          <section className="form-intro" aria-labelledby="form-intro-title">
            {settings.introduction.logo && (
              <img
                src={settings.introduction.logo}
                alt=""
                className="form-intro-logo"
              />
            )}
            <h1 id="form-intro-title">
              {settings.introduction.title || form.name}
            </h1>
            <div className="form-intro-copy">
              {(settings.introduction.blocks.length
                ? settings.introduction.blocks
                : settings.description
                  ? [
                      {
                        text: settings.description,
                        style: "support" as const,
                        align: "center",
                        bold: false,
                        italic: false,
                      },
                    ]
                  : []
              ).map((block, i) => (
                <p
                  key={i}
                  style={{
                    textAlign: block.align as CSSProperties["textAlign"],
                    fontWeight: block.bold ? 700 : 400,
                    fontStyle: block.italic ? "italic" : "normal",
                  }}
                >
                  {block.text}
                </p>
              ))}
            </div>
            <Button type="button" onClick={() => setIntroSeen(true)}>
              {settings.introduction.buttonLabel}
              <ArrowRight size={16} />
            </Button>
          </section>
        )}
        {!introVisible && (
          <div className="form-content">
            <header>
              <small>{clinicName}</small>
              <h1>{form.name}</h1>
              {settings.description && <p>{settings.description}</p>}
              {!live && <span className="form-preview-label">Prévia</span>}
            </header>
            {done ? (
              <div className="form-success" role="status">
                <Check size={42} />
                <h2 ref={heading} tabIndex={-1}>
                  Cadastro concluído
                </h2>
                <p>{version.successMessage}</p>
                <progress
                  max={100}
                  value={100}
                  aria-label="Progresso do formulário"
                />
              </div>
            ) : (
              <>
                <div className="form-progress">
                  <span>
                    Etapa {index + 1} de {sequence.length}
                  </span>
                  <span>
                    {Math.round((index / Math.max(sequence.length, 1)) * 100)}%
                  </span>
                </div>
                <progress
                  value={index}
                  max={Math.max(sequence.length, 1)}
                  aria-label="Progresso do formulário"
                />
                {!sequence.length ? (
                  <p>Adicione perguntas para visualizar o formulário.</p>
                ) : (
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (submitted.current) return;
                      try {
                        if (current === "contacts") validateContacts();
                        else if (step && field)
                          validateAnswer(
                            field,
                            step.question.required,
                            answers[step.question.id],
                          );
                        else throw Error("Pergunta indisponível");
                        if (isLast) {
                          validateContacts();
                          for (const s of routedSteps) {
                            const f = fields.find(
                              (f) => f.id === s.question.fieldDefinitionId,
                            );
                            if (!f) throw Error("Campo indisponível");
                            validateAnswer(
                              f,
                              s.question.required,
                              answers[s.question.id],
                            );
                          }
                        }
                        if (live) {
                          if (isLast) {
                            repositories.capture.capture({
                              ...base(),
                              contacts,
                              answers: Object.fromEntries(
                                routedSteps
                                  .map((s) => [
                                    s.question.id,
                                    answers[s.question.id],
                                  ])
                                  .filter(([, value]) => value !== undefined),
                              ),
                              complete: true,
                            });
                            submitted.current = true;
                          } else if (
                            (current === "contacts" &&
                              settings.contactPosition === "start") ||
                            savedPartial
                          ) {
                            const id = repositories.capture.capture({
                              ...base(),
                              contacts,
                              answers,
                              complete: false,
                              nextIndex: index + 1,
                            });
                            setSavedPartial(Boolean(id));
                          }
                          if (step)
                            repositories.capture.action(base(), step.actionId);
                          refresh();
                        }
                        setError("");
                        if (isLast) setDone(true);
                        else setIndex((i) => i + 1);
                      } catch (err) {
                        setError(
                          err instanceof z.ZodError
                            ? err.issues[0]?.code === "invalid_type"
                              ? "Confira a resposta antes de continuar."
                              : (err.issues[0]?.message ??
                                "Confira a resposta.")
                            : err instanceof Error
                              ? err.message
                              : "Confira os campos",
                        );
                      }
                    }}
                  >
                    <h2 ref={heading} tabIndex={-1}>
                      {current === "contacts"
                        ? "Como podemos falar com você?"
                        : step?.question.label}
                    </h2>
                    {current === "contacts" ? (
                      <>
                        {(["name", "phone", "email"] as const)
                          .filter((k) => settings.contacts[k].enabled)
                          .map((k) => (
                            <label key={k}>
                              {settings.contacts[k].label}
                              {settings.contacts[k].required
                                ? " *"
                                : " (opcional)"}
                              <input
                                autoComplete={
                                  {
                                    name: "name",
                                    phone: "tel",
                                    email: "email",
                                  }[k]
                                }
                                type={
                                  {
                                    name: "text",
                                    phone: "tel",
                                    email: "email",
                                  }[k]
                                }
                                maxLength={200}
                                value={contacts[k]}
                                aria-invalid={Boolean(error)}
                                onChange={(e) => {
                                  setContacts((c) => ({
                                    ...c,
                                    [k]: e.target.value,
                                  }));
                                  setError("");
                                }}
                              />
                            </label>
                          ))}
                        <p className="form-privacy">
                          Ao avançar, seus contatos e respostas serão
                          registrados para atendimento, mesmo se você não
                          concluir as próximas etapas.
                        </p>
                      </>
                    ) : step && field ? (
                      <>
                        {step.description && <p>{step.description}</p>}
                        <label
                          className="sr-only"
                          htmlFor={`answer-${step.question.id}`}
                        >
                          {step.question.label}
                        </label>
                        <FieldInput
                          choiceCards
                          id={`answer-${step.question.id}`}
                          field={{ ...field, label: step.question.label }}
                          value={answers[step.question.id]}
                          errorId={error ? "form-error" : undefined}
                          onChange={(v) => {
                            setAnswers((a) => {
                              const next = { ...a, [step.question.id]: v };
                              const eligible = new Set(
                                eligibleSteps(version, fields, next).map(
                                  (item) => item.question.id,
                                ),
                              );
                              for (const key of Object.keys(next))
                                if (!eligible.has(key)) delete next[key];
                              return next;
                            });
                            setIndex((currentIndex) =>
                              Math.min(
                                currentIndex,
                                Math.max(sequence.length - 1, 0),
                              ),
                            );
                            setError("");
                          }}
                        />
                      </>
                    ) : null}
                    {error && (
                      <p id="form-error" role="alert" className="field-error">
                        {error}
                      </p>
                    )}
                    <div className="form-navigation">
                      {settings.introduction.mode === "separate" &&
                        index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIntroSeen(false)}
                          >
                            Apresentação
                          </Button>
                        )}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => {
                          setIndex((i) => i - 1);
                          setError("");
                        }}
                      >
                        Voltar
                      </Button>
                      <Button
                        type="submit"
                        data-action-id={
                          step?.actionId ?? `contacts-${version.id}`
                        }
                        data-step-id={current}
                      >
                        {isLast
                          ? "Enviar cadastro"
                          : step?.buttonLabel || "Continuar"}
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
