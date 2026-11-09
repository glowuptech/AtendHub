"use client";
import { Card } from "@/components/layout/shared";
import { settingsOf, type FormSettings } from "../services/settings";
import { useState, useRef, useEffect } from "react";
export function SettingsEditor({
  value,
  onChange,
  disabled,
  section,
}: {
  value?: FormSettings;
  onChange: (v: FormSettings) => void;
  disabled: boolean;
  section?: "presentation" | "contacts" | "appearance" | "tracking" | "none";
}) {
  const s = settingsOf(value);
  const latest = useRef(s);
  useEffect(() => {
    latest.current = s;
  }, [s]);
  const [error, setError] = useState("");
  const patch = (v: Partial<FormSettings>) => onChange({ ...s, ...v });
  async function upload(
    file: File | undefined,
    key: "cover" | "backgroundImage",
  ) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1000000
    ) {
      setError("Escolha uma imagem PNG, JPEG ou WebP de até 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const current = latest.current;
      onChange({
        ...current,
        appearance: { ...current.appearance, [key]: String(reader.result) },
      });
      setError("");
    };
    reader.onerror = () => setError("Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  }
  return (
    <fieldset disabled={disabled}>
      {(!section || section === "presentation") && (
        <div>
          <Card title="Apresentação">
            <label>
              Como apresentar
              <select
                value={s.introduction.mode}
                onChange={(e) =>
                  patch({
                    introduction: {
                      ...s.introduction,
                      mode: e.target
                        .value as FormSettings["introduction"]["mode"],
                    },
                  })
                }
              >
                <option value="separate">Tela de apresentação separada</option>
                <option value="integrated">
                  Apresentação junto da primeira pergunta
                </option>
                <option value="none">Sem apresentação</option>
              </select>
            </label>
            <label>
              Título
              <input
                maxLength={160}
                value={s.introduction.title}
                onChange={(e) =>
                  patch({
                    introduction: { ...s.introduction, title: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Texto formatado (uma linha por parágrafo)
              <textarea
                value={s.introduction.blocks.map((b) => b.text).join("\\n")}
                onChange={(e) =>
                  patch({
                    introduction: {
                      ...s.introduction,
                      blocks: e.target.value.split("\\n").map((text) => ({
                        text,
                        style: "support" as const,
                        align: s.introduction.align,
                        bold: false,
                        italic: false,
                      })),
                    },
                  })
                }
              />
            </label>
            <div className="profile-info-grid">
              <label>
                Alinhamento
                <select
                  value={s.introduction.align}
                  onChange={(e) =>
                    patch({
                      introduction: {
                        ...s.introduction,
                        align: e.target
                          .value as FormSettings["introduction"]["align"],
                      },
                    })
                  }
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </label>
              <label>
                Largura máxima
                <input
                  type="number"
                  min={280}
                  max={1000}
                  value={s.introduction.maxWidth}
                  onChange={(e) =>
                    patch({
                      introduction: {
                        ...s.introduction,
                        maxWidth: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Posição vertical
                <select
                  value={s.introduction.vertical}
                  onChange={(e) =>
                    patch({
                      introduction: {
                        ...s.introduction,
                        vertical: e.target
                          .value as FormSettings["introduction"]["vertical"],
                      },
                    })
                  }
                >
                  <option value="top">Topo</option>
                  <option value="center">Centro</option>
                  <option value="bottom">Inferior</option>
                </select>
              </label>
              <label>
                Texto do botão
                <input
                  value={s.introduction.buttonLabel}
                  onChange={(e) =>
                    patch({
                      introduction: {
                        ...s.introduction,
                        buttonLabel: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              <input
                type="checkbox"
                checked={s.introduction.inheritAppearance}
                onChange={(e) =>
                  patch({
                    introduction: {
                      ...s.introduction,
                      inheritAppearance: e.target.checked,
                    },
                  })
                }
              />{" "}
              Herdar aparência geral
            </label>
            <label>
              Descrição antiga (compatibilidade)
              <textarea
                value={s.description}
                maxLength={1500}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />{" "}
              Formulário ativo
            </label>
          </Card>
        </div>
      )}
      {(!section || section === "contacts") && (
        <div id="editor-contacts">
          <Card title="Dados de contato">
            <label>
              Posição dos contatos
              <select
                value={s.contactPosition}
                onChange={(e) =>
                  patch({ contactPosition: e.target.value as "start" | "end" })
                }
              >
                <option value="start">Antes das perguntas</option>
                <option value="end">Depois das perguntas</option>
              </select>
            </label>
            {(["name", "phone", "email"] as const).map((k) => (
              <div className="contact-config" key={k}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.contacts[k].enabled}
                    onChange={(e) =>
                      patch({
                        contacts: {
                          ...s.contacts,
                          [k]: { ...s.contacts[k], enabled: e.target.checked },
                        },
                      })
                    }
                  />{" "}
                  {{ name: "Nome", phone: "Telefone", email: "E-mail" }[k]}
                </label>
                <label>
                  Rótulo de{" "}
                  {{ name: "nome", phone: "telefone", email: "e-mail" }[k]}
                  <input
                    maxLength={80}
                    value={s.contacts[k].label}
                    onChange={(e) =>
                      patch({
                        contacts: {
                          ...s.contacts,
                          [k]: { ...s.contacts[k], label: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!s.contacts[k].enabled}
                    checked={s.contacts[k].required}
                    onChange={(e) =>
                      patch({
                        contacts: {
                          ...s.contacts,
                          [k]: { ...s.contacts[k], required: e.target.checked },
                        },
                      })
                    }
                  />{" "}
                  Obrigatório
                </label>
              </div>
            ))}
            <p className="muted">
              Com nome e telefone no início, o contato pode ser salvo antes de
              concluir as perguntas.
            </p>
          </Card>
        </div>
      )}
      {(!section || section === "appearance") && (
        <div id="editor-appearance">
          <Card title="Identidade do formulário">
            <div className="profile-info-grid">
              {(
                [
                  "primary",
                  "button",
                  "buttonText",
                  "background",
                  "text",
                  "border",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      primary: "Cor principal",
                      button: "Botão",
                      buttonText: "Texto do botão",
                      background: "Fundo",
                      text: "Texto",
                      border: "Borda",
                    }[k]
                  }
                  <input
                    className="form-color-picker"
                    type="color"
                    aria-label={
                      {
                        primary: "Cor principal",
                        button: "Botão",
                        buttonText: "Texto do botão",
                        background: "Fundo",
                        text: "Texto",
                        border: "Borda",
                      }[k]
                    }
                    value={s.appearance[k]}
                    onChange={(e) =>
                      patch({
                        appearance: { ...s.appearance, [k]: e.target.value },
                      })
                    }
                  />
                  <span className="form-color-code">
                    {s.appearance[k].toUpperCase()}
                  </span>
                </label>
              ))}
              <label>
                Fonte
                <select
                  value={s.appearance.font}
                  onChange={(e) =>
                    patch({
                      appearance: {
                        ...s.appearance,
                        font: e.target
                          .value as FormSettings["appearance"]["font"],
                      },
                    })
                  }
                >
                  {[
                    "system",
                    "Arial",
                    "Verdana",
                    "Georgia",
                    "Trebuchet MS",
                    "Palatino",
                  ].map((f) => (
                    <option key={f} value={f}>
                      {f === "system" ? "Sistema (moderna)" : f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Arredondamento dos botões
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={s.appearance.radius}
                  onChange={(e) =>
                    patch({
                      appearance: {
                        ...s.appearance,
                        radius: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              {(["cover", "backgroundImage"] as const).map((k) => (
                <div key={k}>
                  <label>
                    {k === "cover"
                      ? "Capa opcional"
                      : "Imagem de fundo opcional"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void upload(e.target.files?.[0], k)}
                    />
                  </label>
                  {s.appearance[k] && (
                    <div className="form-asset-preview">
                      <img
                        src={s.appearance[k]}
                        alt={
                          k === "cover"
                            ? "Prévia da capa"
                            : "Prévia da imagem de fundo"
                        }
                      />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          patch({ appearance: { ...s.appearance, [k]: "" } })
                        }
                      >
                        {k === "cover"
                          ? "Remover capa"
                          : "Remover imagem de fundo"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="appearance-control-grid">
              <label>
                Fundo do painel: {s.appearance.panelOpacity}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={s.appearance.panelOpacity}
                  onChange={(e) =>
                    patch({
                      appearance: {
                        ...s.appearance,
                        panelOpacity: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Escurecimento da imagem: {s.appearance.overlayOpacity}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={s.appearance.overlayOpacity}
                  onChange={(e) =>
                    patch({
                      appearance: {
                        ...s.appearance,
                        overlayOpacity: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Cor da sobreposição
                <input
                  className="form-color-picker"
                  type="color"
                  aria-label="Cor da sobreposição"
                  value={s.appearance.overlay}
                  onChange={(e) =>
                    patch({
                      appearance: { ...s.appearance, overlay: e.target.value },
                    })
                  }
                />
              </label>
            </div>
            {s.appearance.backgroundImage && (
              <div className="notice">
                {s.appearance.panelOpacity === 100 && (
                  <p>
                    O painel está sólido e cobre a foto atrás do texto. Reduza
                    “Fundo do painel” para ver a imagem.
                  </p>
                )}
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() =>
                    patch({
                      appearance: {
                        ...s.appearance,
                        panelOpacity: 0,
                        overlay: "#000000",
                        overlayOpacity: 55,
                        text: "#ffffff",
                      },
                    })
                  }
                >
                  Usar foto escura com texto claro
                </button>
              </div>
            )}
            <p className="muted">
              O painel, o texto e a sobreposição são camadas independentes. Em
              “Fundo do painel”, 0% é transparente e 100% é sólido. Textos e
              botões continuam opacos.
            </p>
            {error && <p role="alert">{error}</p>}
          </Card>
        </div>
      )}
      {(!section || section === "tracking") && (
        <div id="editor-tracking">
          <Card title="Meta Pixel e conversões">
            <label>
              ID do Meta Pixel (opcional)
              <input
                inputMode="numeric"
                value={s.tracking.pixelId}
                onChange={(e) =>
                  patch({
                    tracking: {
                      ...s.tracking,
                      pixelId: e.target.value.replace(/\D/g, "").slice(0, 30),
                    },
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.tracking.pageView}
                onChange={(e) =>
                  patch({
                    tracking: { ...s.tracking, pageView: e.target.checked },
                  })
                }
              />{" "}
              Preparar PageView após tempo mínimo
            </label>
            <label>
              Tempo de página visível
              <select
                value={s.tracking.viewSeconds}
                onChange={(e) =>
                  patch({
                    tracking: {
                      ...s.tracking,
                      viewSeconds: Number(e.target.value) as 5 | 10,
                    },
                  })
                }
              >
                <option value={5}>5 segundos</option>
                <option value={10}>10 segundos</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.tracking.lead}
                onChange={(e) =>
                  patch({ tracking: { ...s.tracking, lead: e.target.checked } })
                }
              />{" "}
              Preparar Lead após cadastro aceito
            </label>
            <p className="muted">
              Eventos por botão são configurados nas perguntas. Configuração
              preparada; nenhum evento é enviado à Meta nesta fase. Cadastro
              concluído não significa lead qualificado.
            </p>
          </Card>
          <Card title="Cadastros incompletos e notificações">
            <label>
              Minutos sem avanço antes de marcar incompleto
              <input
                type="number"
                min={1}
                max={1440}
                value={s.tracking.abandonMinutes}
                onChange={(e) =>
                  patch({
                    tracking: {
                      ...s.tracking,
                      abandonMinutes: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <p>
              Todos os formulários geram eventos de cadastro concluído e
              incompleto para a fila de notificações. O destino n8n será
              configurado no servidor.
            </p>
          </Card>
        </div>
      )}
    </fieldset>
  );
}
