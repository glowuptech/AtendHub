"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { z } from "zod";
import {
  type FormDefinition,
  type FormVersion,
  type CustomFieldDefinition,
  type FieldValue,
  type FormEvent,
  validateAnswer,
} from "@/domain/schemas";
import { MemoryFormEventRecorder } from "@/lib/tracking/internal";
import { Button } from "@/components/ui/button";
import { FieldInput } from "./field-input";
import { Badge } from "@/components/layout/shared";
export function FormWizard({
  form,
  version,
  fields,
  clinicName,
  compact = false,
}: {
  form: FormDefinition;
  version: FormVersion;
  fields: CustomFieldDefinition[];
  clinicName: string;
  compact?: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0),
    [answers, setAnswers] = useState<Record<string, FieldValue>>({}),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [epoch, setEpoch] = useState(0);
  const session = useRef("");
  const recorder = useRef(new MemoryFormEventRecorder());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = version.steps[stepIndex];
  const field = fields.find((f) => f.id === step?.question.fieldDefinitionId);
  function record(eventType: FormEvent["eventType"], actionId?: string) {
    recorder.current.record({
      eventId: crypto.randomUUID(),
      formId: form.id,
      versionId: version.id,
      sessionId: session.current,
      stepId: step.id,
      actionId,
      eventType,
      timestamp: new Date().toISOString(),
    });
  }
  useEffect(() => {
    const store = recorder.current;
    session.current = crypto.randomUUID();
    const sid = session.current;
    const base = { formId: form.id, versionId: version.id, sessionId: sid };
    store.record({
      ...base,
      eventId: crypto.randomUUID(),
      eventType: "form_view",
      timestamp: new Date().toISOString(),
    });
    let visible = 0,
      last = performance.now(),
      engaged = false;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible" && document.hasFocus())
        visible += Math.min(now - last, 1000);
      last = now;
      if (visible >= 10000 && !engaged) {
        engaged = true;
        store.record({
          ...base,
          eventId: crypto.randomUUID(),
          eventType: "engaged_10s",
          elapsedVisibleMs: visible,
          timestamp: new Date().toISOString(),
        });
      }
    }, 250);
    return () => {
      clearInterval(timer);
      store.clear(sid);
    };
  }, [form.id, version.id, epoch]);
  useEffect(() => {
    if (step && !done) {
      recorder.current.record({
        eventId: crypto.randomUUID(),
        formId: form.id,
        versionId: version.id,
        sessionId: session.current,
        stepId: step.id,
        eventType: "step_view",
        timestamp: new Date().toISOString(),
      });
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [step, form.id, version.id, done, epoch]);
  if (!step || !field)
    return (
      <p role="alert">Adicione uma pergunta válida para abrir a prévia.</p>
    );
  function restart() {
    setStepIndex(0);
    setAnswers({});
    setDone(false);
    setError("");
    setEpoch((e) => e + 1);
  }
  return (
    <section
      data-clinic-theme={version.theme}
      className={`wizard ${compact ? "compact" : ""}`}
    >
      <div className="wizard-brand">
        <span className="brand-symbol">
          p<span>✦</span>
        </span>
        <span>{clinicName}</span>
      </div>
      <Badge>Prévia / não publicado</Badge>
      {done ? (
        <div className="wizard-success" role="status">
          <Check size={44} />
          <h2>Pronto, prévia concluída.</h2>
          <p>{version.successMessage}</p>
          <Button onClick={restart}>
            <RotateCcw size={16} />
            Reiniciar prévia
          </Button>
        </div>
      ) : (
        <>
          <div className="wizard-progress">
            <span>
              Etapa {stepIndex + 1} de {version.steps.length}
            </span>
            <span>{Math.round((stepIndex / version.steps.length) * 100)}%</span>
          </div>
          <progress
            value={stepIndex}
            max={version.steps.length}
            aria-label="Progresso do formulário"
          />
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              record("action_clicked", step.actionId);
              try {
                validateAnswer(
                  field,
                  step.question.required,
                  answers[step.question.id],
                );
                record("step_completed", step.actionId);
                setError("");
                if (stepIndex < version.steps.length - 1)
                  setStepIndex((i) => i + 1);
                else {
                  setDone(true);
                  setAnswers(
                    {},
                  ); /* No form_submitted: no backend transaction exists in C1. */
                }
              } catch (err) {
                setError(
                  err instanceof z.ZodError
                    ? err.issues[0].message
                    : "Resposta inválida",
                );
                record("form_validation_failed", step.actionId);
              }
            }}
          >
            <p className="eyebrow">
              {step.question.required
                ? "RESPOSTA OBRIGATÓRIA"
                : "RESPOSTA OPCIONAL"}
            </p>
            <h2 tabIndex={-1} ref={titleRef}>
              {step.title}
            </h2>
            <p>{step.description}</p>
            <label
              className="input-label"
              htmlFor={`answer-${step.question.id}`}
            >
              {step.question.label}
            </label>
            <FieldInput
              id={`answer-${step.question.id}`}
              field={{ ...field, label: step.question.label }}
              value={answers[step.question.id]}
              errorId={error ? `error-${step.id}` : undefined}
              onChange={(v) => {
                setAnswers((a) => ({ ...a, [step.question.id]: v }));
                setError("");
              }}
            />
            {error && (
              <p className="field-error" id={`error-${step.id}`} role="alert">
                {error}
              </p>
            )}
            <Button
              className="wizard-next"
              type="submit"
              data-action-id={step.actionId}
              data-step-id={step.id}
            >
              {step.buttonLabel}
              <ArrowRight size={16} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={stepIndex === 0}
              data-action-id={step.backActionId}
              onClick={() => {
                record("action_clicked", step.backActionId);
                setStepIndex((i) => i - 1);
                setError("");
              }}
            >
              Voltar
            </Button>
          </form>
          <button className="text-button" onClick={restart}>
            Limpar e reiniciar
          </button>
        </>
      )}
      <div className="wizard-footer">
        Dados  · nada é enviado
        <br />
        Respostas somente em memória nesta prévia.
      </div>
    </section>
  );
}
