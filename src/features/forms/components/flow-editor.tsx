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
          <div className="journey-map" aria-label="Mapa dos caminhos">
            <div className="journey-origin">
              <span>Pergunta de entrada</span>
              <strong>{router.question.label}</strong>
            </div>
            <p className="muted">
              Cada resposta conecta a um caminho. Abra “Escolher perguntas” no
              cartão para definir a sequência. Salve o rascunho ao terminar.
            </p>
            <div className="journey-branches">
              {field?.options.map((option, index) => {
                const path = paths.find((p) => p.id === option.pathId);
                const following = version.steps.filter(
                  (s) => s.id !== router.id,
                );
                const exclusive = following.filter(
                  (s) => path && s.question.pathIds.includes(path.id),
                );
                return (
                  <section
                    className="journey-branch"
                    key={option.id}
                    style={{
                      borderColor: ["#7c3aed", "#0f766e", "#be185d", "#b45309"][
                        index % 4
                      ],
                    }}
                    aria-label={`Resposta ${option.label}`}
                  >
                    <div className="journey-answer">
                      <small>SE RESPONDER</small>
                      <strong>{option.label || "Opção sem título"}</strong>
                    </div>
                    <div className="journey-connector" aria-hidden="true">
                      ↓
                    </div>
                    <label>
                      SEGUIR PARA
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
                                        ? {
                                            ...o,
                                            pathId: e.target.value || null,
                                          }
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
                    {path && (
                      <>
                        <div className="journey-connector" aria-hidden="true">
                          ↓
                        </div>
                        <ol className="journey-questions">
                          {exclusive.map((s) => (
                            <li key={s.id}>
                              {s.question.label}
                              {s.question.pathIds.length > 1 && (
                                <small>Compartilhada com outros caminhos</small>
                              )}
                            </li>
                          ))}
                        </ol>
                        {!exclusive.length && (
                          <p className="muted">
                            Este caminho ainda não tem perguntas específicas.
                          </p>
                        )}
                        <details>
                          <summary>Escolher perguntas de {path.name}</summary>
                          <p className="muted">
                            Marcar tira a pergunta de “Todos” e a inclui neste
                            caminho. Você pode marcar a mesma pergunta em outros
                            caminhos. Desmarcar o último destino volta a
                            exibi-la para todos.
                          </p>
                          {following.map((s) => (
                            <label className="check-option" key={s.id}>
                              <input
                                type="checkbox"
                                disabled={
                                  version.steps.indexOf(s) <
                                  version.steps.indexOf(router)
                                }
                                checked={s.question.pathIds.includes(path.id)}
                                onChange={(e) =>
                                  onChange(
                                    {
                                      ...version,
                                      steps: version.steps.map((item) =>
                                        item.id === s.id
                                          ? {
                                              ...item,
                                              question: {
                                                ...item.question,
                                                pathIds: e.target.checked
                                                  ? [
                                                      ...item.question.pathIds,
                                                      path.id,
                                                    ]
                                                  : item.question.pathIds.filter(
                                                      (id) => id !== path.id,
                                                    ),
                                              },
                                            }
                                          : item,
                                      ),
                                    },
                                    fields,
                                  )
                                }
                              />
                              {s.question.label}
                              {version.steps.indexOf(s) <
                              version.steps.indexOf(router)
                                ? " (antes da escolha)"
                                : ""}
                            </label>
                          ))}
                        </details>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="journey-common">
              <strong>Perguntas para todos</strong>
              <p className="muted">
                Aparecem em todos os percursos, na posição definida no bloco
                Perguntas.
              </p>
              <ul>
                {version.steps
                  .filter(
                    (s) => s.id !== router.id && !s.question.pathIds.length,
                  )
                  .map((s) => (
                    <li key={s.id}>{s.question.label}</li>
                  ))}
              </ul>
              {!version.steps.some(
                (s) => s.id !== router.id && !s.question.pathIds.length,
              ) && <p>Nenhuma pergunta comum.</p>}
            </div>
            <div className="journey-origin">
              <span>↓</span>
              <strong>Conclusão do formulário</strong>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
