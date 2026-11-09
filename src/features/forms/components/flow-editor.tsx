"use client";
import { useState } from "react";
import type { CustomFieldDefinition, FormVersion } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/layout/shared";
import {
  addPath,
  removePath,
  selectRouter,
  pathsFromOptions,
} from "../services/routing";

type Props = {
  version: FormVersion;
  fields: CustomFieldDefinition[];
  onChange: (version: FormVersion, fields: CustomFieldDefinition[]) => void;
};
export function FlowEditor({ version, fields, onChange }: Props) {
  const [error, setError] = useState("");
  const paths = version.paths ?? [];
  const router = version.steps.find((s) => s.question.definesPath);
  const field = fields.find((f) => f.id === router?.question.fieldDefinitionId);
  const candidates = version.steps.filter((s) =>
    fields.some(
      (f) =>
        f.id === s.question.fieldDefinitionId &&
        ["single_select", "image_choice"].includes(f.type),
    ),
  );
  return (
    <Card title="Fluxo das perguntas">
      <p className="muted">
        Sem caminhos, todas as perguntas aparecem na sequência. Use caminhos
        para mostrar perguntas diferentes conforme a resposta.
      </p>
      <label>
        Pergunta que escolhe o atendimento
        <select
          value={router?.id ?? ""}
          onChange={(e) => {
            if (
              !e.target.value &&
              paths.length &&
              !window.confirm(
                "Voltar ao fluxo linear? Os caminhos e suas associações serão removidos deste rascunho. As perguntas serão mantidas.",
              )
            )
              return;
            onChange(...selectRouter(version, fields, e.target.value || null));
          }}
        >
          <option value="">Fluxo linear — mesmas perguntas para todos</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.question.label}
            </option>
          ))}
        </select>
      </label>
      {!candidates.length && (
        <p>
          Adicione uma pergunta de seleção única ou por imagens no bloco
          “Perguntas” para criar caminhos.
        </p>
      )}
      {router && (
        <>
          {!!field?.options.length &&
            field.options.some(
              (o) => !o.pathId || !paths.some((p) => p.id === o.pathId),
            ) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  try {
                    onChange(...pathsFromOptions(version, fields));
                    setError("");
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Revise as opções.",
                    );
                  }
                }}
              >
                Criar caminhos a partir das respostas
              </Button>
            )}
          {error && <p role="alert">{error}</p>}
          <details className="flow-advanced">
            <summary>Editar nomes e caminhos manualmente</summary>
            {paths.map((path) => (
              <div className="flow-path-row" key={path.id}>
                <span className="badge">{path.letter}</span>
                <label>
                  Nome do caminho {path.letter}
                  <input
                    value={path.name}
                    onChange={(e) =>
                      onChange(
                        {
                          ...version,
                          paths: paths.map((p) =>
                            p.id === path.id
                              ? { ...p, name: e.target.value }
                              : p,
                          ),
                        },
                        fields,
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remover “${path.name}”? Perguntas exclusivas ficarão comuns e destinos precisarão de revisão.`,
                      )
                    )
                      onChange(...removePath(version, fields, path.id));
                  }}
                >
                  Remover caminho {path.letter}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={paths.length >= 26}
              onClick={() =>
                onChange({ ...version, paths: addPath(paths) }, fields)
              }
            >
              Adicionar caminho
            </Button>
          </details>
          <h3>1. Confira o destino de cada resposta</h3>
          {!field?.options.length && (
            <p>Adicione opções a essa pergunta no bloco “Perguntas”.</p>
          )}
          {field?.options.map((option) => (
            <label key={option.id}>
              {option.label || "Opção sem título"} →
              <select
                aria-label={`Destino de ${option.label}`}
                value={option.pathId ?? ""}
                onChange={(e) =>
                  onChange(
                    version,
                    fields.map((f) =>
                      f.id === field.id
                        ? {
                            ...f,
                            options: f.options.map((o) =>
                              o.id === option.id
                                ? { ...o, pathId: e.target.value || null }
                                : o,
                            ),
                          }
                        : f,
                    ),
                  )
                }
              >
                <option value="">Escolha o caminho</option>
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.letter} — {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <h3>2. Escolha quais perguntas aparecem</h3>
          <p className="muted">
            Marque “Todos” para perguntas comuns, ou os caminhos desejados. A
            ordem é a mesma da aba Perguntas.
          </p>
          {version.steps
            .filter((s) => s.id !== router.id)
            .map((s) => {
              const change = (pathIds: string[]) =>
                onChange(
                  {
                    ...version,
                    steps: version.steps.map((item) =>
                      item.id === s.id
                        ? { ...item, question: { ...item.question, pathIds } }
                        : item,
                    ),
                  },
                  fields,
                );
              return (
                <fieldset key={s.id} className="flow-membership">
                  <legend>{s.question.label}</legend>
                  <label className="check-option">
                    <input
                      type="checkbox"
                      checked={!s.question.pathIds.length}
                      onChange={() => change([])}
                    />
                    Todos os caminhos
                  </label>
                  {paths.map((p) => (
                    <label className="check-option" key={p.id}>
                      <input
                        type="checkbox"
                        checked={s.question.pathIds.includes(p.id)}
                        onChange={(e) =>
                          change(
                            e.target.checked
                              ? [...s.question.pathIds, p.id]
                              : s.question.pathIds.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.letter} — {p.name}
                    </label>
                  ))}
                </fieldset>
              );
            })}
        </>
      )}
    </Card>
  );
}
