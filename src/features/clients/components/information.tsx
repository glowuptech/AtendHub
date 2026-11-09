"use client";
import { BillingFields } from "./billing-fields";
import { BillingSchema, monthlyFeeCents } from "@/domain/billing";
import { useState } from "react";
import { Pencil, Save, X, Plus } from "lucide-react";
import { z } from "zod";
import type { Client } from "@/domain/schemas";
import { DoctorSchema } from "@/domain/schemas";
import { Card, Badge } from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
import { ClinicLogo } from "./directory";
import { dateLabel } from "./overview";
import { useClients } from "../hooks";
function Field({
  label,
  value,
  editing,
  onChange,
  type = "text",
  maxLength = 150,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (s: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return editing ? (
    <label>
      {label}
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ) : (
    <div className="profile-info-field">
      <small>{label}</small>
      <strong>
        {value ? (type === "date" ? dateLabel(value) : value) : "Não informado"}
      </strong>
    </div>
  );
}
export function ClientInformation({ client }: { client: Client }) {
  const { mutate } = useClients();
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(client),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const c = editing ? draft : client;
  const list = (s: string) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const patch = (p: Partial<Client>) => setDraft((d) => ({ ...d, ...p }));
  return (
    <form
      className="profile-information"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const formData = new FormData(e.currentTarget);
          const payload = {
            ...draft,
            billing: {
              ...(draft.billing ?? BillingSchema.parse({})),
              monthlyFeeCents: monthlyFeeCents(String(formData.get("monthlyFee") ?? "")),
            },
            specialties: list(String(formData.get("specialties") ?? "")),
            doctors: draft.doctors.map((d) => ({ ...d, specialties: list(String(formData.get(`doctor-specialties-${d.id}`) ?? "")) })),
          };
          const response = await fetch(`/api/clients/${client.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          const body = await response.json();
          if (!response.ok) throw new Error(`${body.error ?? "Não foi possível salvar o cliente."}${body.supportId ? ` Código de suporte: ${body.supportId}` : ""}`);
          await mutate((items) => items?.map((item) => item.id === client.id ? body : item), { revalidate: true });
          setEditing(false);
          setError("");
          setMessage("Informações, profissionais e operação salvos no Supabase.");
        } catch (err) {
          setError(
            err instanceof z.ZodError
              ? `${err.issues[0].path.join(" → ")}: ${err.issues[0].message}`
              : err instanceof Error
                ? err.message
                : "Verifique os campos.",
          );
        }
      }}
    >
      <div className="section-caption">
        <div>
          <h2>Informações e cadastro</h2>
          <p className="muted">
            Identificação, contato, endereço, corpo clínico e controle da
            parceria.
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            onClick={() => {
              setDraft(structuredClone(client));
              setEditing(true);
              setMessage("");
              setError("");
            }}
          >
            <Pencil size={15} />
            Editar informações
          </Button>
        ) : (
          <Badge>Modo de edição</Badge>
        )}
      </div>
      {editing && (
        <div className="profile-edit-notice">
          Use apenas informações . As alterações ficam em memória; nenhum
          contrato é assinado, renovado ou enviado por esta tela.
        </div>
      )}
      <div className="profile-info-grid">
        <Card title="Identificação">
          <div className="profile-logo-row">
            <ClinicLogo client={c} />
            <div>
              <strong>{client.name}</strong>
              <small>Logotipo cadastrado</small>
            </div>
          </div>
          <Field
            label="Nome da clínica ou profissional"
            value={c.name}
            editing={editing}
            onChange={(name) => patch({ name })}
            maxLength={120}
          />
          <div className="form-columns">
            {editing ? (
              <>
                <label>
                  Categoria
                  <select
                    value={c.category}
                    onChange={(e) =>
                      patch({ category: e.target.value as Client["category"] })
                    }
                  >
                    <option value="clinic">Clínica</option>
                    <option value="doctor_male">Médico</option>
                    <option value="doctor_female">Médica</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={c.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as Client["status"] })
                    }
                  >
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <div className="profile-info-field">
                  <small>Categoria</small>
                  <strong>
                    {
                      {
                        clinic: "Clínica",
                        doctor_male: "Médico",
                        doctor_female: "Médica",
                      }[c.category]
                    }
                  </strong>
                </div>
                <div className="profile-info-field">
                  <small>Status</small>
                  <strong>{c.status === "active" ? "Ativo" : "Pausado"}</strong>
                </div>
              </>
            )}
          </div>
          <Field
            label="CNPJ "
            value={c.cnpj ?? ""}
            editing={editing}
            onChange={(cnpj) =>
              patch({ cnpj: cnpj.replace(/\D/g, "") || null })
            }
            maxLength={18}
          />
          <Field
            label="Descrição / unidade"
            value={c.description}
            editing={editing}
            onChange={(description) => patch({ description })}
          />
          {editing ? (
            <label>
              Especialidades, separadas por vírgula
              <input
                name="specialties"
                defaultValue={c.specialties.join(", ")}
              />
            </label>
          ) : (
            <div className="profile-info-field">
              <small>Especialidades</small>
              <strong>{c.specialties.join(" · ") || "Não informado"}</strong>
            </div>
          )}
        </Card>
        <Card title="Contato administrativo">
          <Field
            label="Responsável na clínica"
            value={c.contactName}
            editing={editing}
            onChange={(contactName) => patch({ contactName })}
          />
          <Field
            label="Telefone administrativo"
            value={c.contactPhone}
            editing={editing}
            onChange={(contactPhone) => patch({ contactPhone })}
            type="tel"
            maxLength={30}
          />
          <Field
            label="E-mail administrativo"
            value={c.contactEmail}
            editing={editing}
            onChange={(contactEmail) => patch({ contactEmail })}
            type="email"
          />
          <div className="profile-info-field">
            <small>Operadora</small>
            <strong>GlowUp · Prescrita</strong>
          </div>
          <small>
            Não incluir senhas de agenda, dados de pacientes ou informações
            clínicas neste cadastro.
          </small>
        </Card>
        <Card title="Endereço">
          {(
            [
              ["postalCode", "CEP"],
              ["street", "Logradouro"],
              ["number", "Número"],
              ["complement", "Complemento"],
              ["neighborhood", "Bairro"],
              ["city", "Cidade"],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={c.address[key]}
              editing={editing}
              onChange={(v) =>
                patch({
                  address: {
                    ...draft.address,
                    [key]: key === "postalCode" ? v.replace(/\D/g, "") : v,
                  },
                })
              }
            />
          ))}
          {editing ? (
            <label>
              UF do endereço
              <select
                value={c.address.state}
                onChange={(e) =>
                  patch({
                    address: {
                      ...draft.address,
                      state: e.target.value as Client["address"]["state"],
                    },
                  })
                }
              >
                <option value="">Não informado</option>
                {DoctorSchema.shape.uf.options.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="profile-info-field">
              <small>UF</small>
              <strong>{c.address.state || "Não informado"}</strong>
            </div>
          )}
        </Card>
        <Card title="Projeto e contrato">
          {(
            [
              ["projectStartedOn", "Início do projeto"],
              ["signedOn", "Data de assinatura do contrato"],
              ["signatureDueOn", "Prazo para assinatura"],
              ["renewsOn", "Próxima renovação do contrato"],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={c.partnership[key] ?? ""}
              editing={editing}
              type="date"
              onChange={(v) =>
                patch({
                  partnership: { ...draft.partnership, [key]: v || null },
                })
              }
            />
          ))}
          <Field
            label="Responsável pela parceria"
            value={c.partnership.manager}
            editing={editing}
            onChange={(manager) =>
              patch({ partnership: { ...draft.partnership, manager } })
            }
          />
          {editing ? (
            <label>
              Observações administrativas
              <textarea
                value={c.partnership.notes}
                maxLength={1500}
                onChange={(e) =>
                  patch({
                    partnership: {
                      ...draft.partnership,
                      notes: e.target.value,
                    },
                  })
                }
              />
            </label>
          ) : (
            <div className="profile-info-field">
              <small>Observações administrativas</small>
              <strong>{c.partnership.notes || "Não informado"}</strong>
            </div>
          )}
          <small>
            Sem data de assinatura, o contrato permanece pendente. A renovação
            precisa ser posterior à assinatura e ao início do projeto. Datas sem
            informação não geram contagens presumidas.
          </small>
        </Card>
      </div>
      <BillingFields
        value={c.billing}
        editing={editing}
        onChange={(billing) => patch({ billing })}
      />
      <Card title="Corpo clínico">
        {c.doctors.map((d, i) => (
          <fieldset key={d.id} className="profile-doctor-fields">
            <legend>Profissional {i + 1}</legend>
            <Field
              label={`Nome do profissional ${i + 1}`}
              value={d.name}
              editing={editing}
              onChange={(name) =>
                patch({
                  doctors: draft.doctors.map((v) =>
                    v.id === d.id ? { ...v, name } : v,
                  ),
                })
              }
            />
            <div className="form-columns">
              <Field
                label={`CRM do profissional ${i + 1}`}
                value={d.crm ?? ""}
                editing={editing}
                onChange={(crm) =>
                  patch({
                    doctors: draft.doctors.map((v) =>
                      v.id === d.id ? { ...v, crm: crm || null } : v,
                    ),
                  })
                }
                maxLength={8}
              />
              {editing ? (
                <label>
                  UF do CRM
                  <select
                    value={d.uf}
                    onChange={(e) =>
                      patch({
                        doctors: draft.doctors.map((v) =>
                          v.id === d.id
                            ? { ...v, uf: e.target.value as typeof d.uf }
                            : v,
                        ),
                      })
                    }
                  >
                    {DoctorSchema.shape.uf.options.map((uf) => (
                      <option key={uf}>{uf}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="profile-info-field">
                  <small>UF do CRM</small>
                  <strong>{d.uf}</strong>
                </div>
              )}
            </div>
            {editing ? (
              <label>
                Especialidades do profissional
                <input
                  name={`doctor-specialties-${d.id}`}
                  defaultValue={d.specialties.join(", ")}
                />
              </label>
            ) : (
              <small>
                {d.specialties.join(" · ") || "Especialidades não informadas"}
              </small>
            )}
          </fieldset>
        ))}
        {!c.doctors.length && <p>Nenhum profissional cadastrado.</p>}
        {editing && (
          <Button
            type="button"
            variant="outline"
            disabled={c.doctors.length >= 20}
            onClick={() =>
              patch({
                doctors: [
                  ...draft.doctors,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    crm: null,
                    uf: "SP",
                    specialties: [],
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            Adicionar profissional
          </Button>
        )}
      </Card>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p role="status">{message}</p>
      {editing && (
        <div className="profile-save-bar">
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setError("");
                setMessage("Edição cancelada. Nenhuma alteração aplicada.");
              }}
            >
              <X size={15} />
              Cancelar
            </Button>
            <Button type="submit">
              <Save size={15} />
              Salvar alterações
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
