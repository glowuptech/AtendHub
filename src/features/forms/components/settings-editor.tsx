"use client";
import { Card } from "@/components/layout/shared";
import { settingsOf, type FormSettings } from "../services/settings";
import { useState } from "react";
export function SettingsEditor({
  value,
  onChange,
  disabled,
}: {
  value?: FormSettings;
  onChange: (v: FormSettings) => void;
  disabled: boolean;
}) {
  const s = settingsOf(value);
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
      patch({ appearance: { ...s.appearance, [key]: String(reader.result) } });
      setError("");
    };
    reader.onerror = () => setError("Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  }
  return (
    <fieldset disabled={disabled}>
      <Card title="Apresentação">
        <label>
          Descrição do formulário
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
                  type="color"
                  value={s.appearance[k]}
                  onChange={(e) =>
                    patch({
                      appearance: { ...s.appearance, [k]: e.target.value },
                    })
                  }
                />
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
                  {k === "cover" ? "Capa opcional" : "Imagem de fundo opcional"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void upload(e.target.files?.[0], k)}
                  />
                </label>
                {s.appearance[k] && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      patch({ appearance: { ...s.appearance, [k]: "" } })
                    }
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
        </Card>
      </div>
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
    </fieldset>
  );
}
