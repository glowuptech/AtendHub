"use client";
import { BillingFields } from "./billing-fields";
import { BillingSchema, monthlyFeeCents } from "@/domain/billing";
import { useRef, useState } from "react";
import { useClients } from "../hooks";
import Link from "next/link";
import Image from "next/image";
import {
  Building2,
  Copy,
  Plus,
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  X,
  Check,
} from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import { Heading, Card, Badge, Empty } from "@/components/layout/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClientSchema, DoctorSchema, type Client } from "@/domain/schemas";
import { z } from "zod";
import {
  clientCategories as categories,
  clientCategory,
  clientOperations,
} from "../operation";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const formatCnpj = (s: string) =>
  s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
export function ClinicLogo({
  client,
}: {
  client: Pick<Client, "name" | "logo">;
}) {
  return (
    <div className="clinic-logo">
      {client.logo ? (
        <Image
          unoptimized
          width={64}
          height={64}
          src={client.logo}
          alt={`Logotipo de ${client.name}`}
        />
      ) : (
        <Building2 size={28} aria-label="Sem logotipo" />
      )}
    </div>
  );
}
function CopyButton({ value, label }: { value: string | null; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  return (
    <span className="copy-control">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Copiar ${label}`}
        title={value ? `Copiar ${label}` : `${label} não informado`}
        disabled={!value}
        onClick={async () => {
          try {
            if (!value) return;
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
      </Button>
      <span
        className={state === "idle" ? "sr-only" : "copy-feedback"}
        role="status"
      >
        {state === "copied"
          ? "Copiado"
          : state === "error"
            ? "Não foi possível copiar. Selecione o texto manualmente."
            : ""}
      </span>
    </span>
  );
}
export function Clients() {
  const { repositories, scope, setClientId } = useDemo();
  const { data: remoteClients, error: clientsError, isLoading } = useClients();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [category, setCategory] = useState("all"),
    [specialty, setSpecialty] = useState("all"),
    [showFilters, setShowFilters] = useState(false),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const clients = remoteClients ?? [];
  const specialties = [
    ...new Set(
      clients.flatMap((c) => [
        ...c.specialties,
        ...c.doctors.flatMap((d) => d.specialties),
      ]),
    ),
  ].sort();
  const list = clients.filter((c) => {
    const haystack = normalize(
      [
        c.name,
        c.cnpj ?? "",
        c.cnpj ? formatCnpj(c.cnpj) : "",
        categories[c.category],
        clientOperations[c.vertical].name,
        ...c.specialties,
        ...c.doctors.flatMap((d) => [
          d.name,
          d.crm ?? "",
          d.uf,
          ...d.specialties,
        ]),
      ].join(" "),
    );
    return (
      haystack.includes(normalize(search.trim())) &&
      (status === "all" || c.status === status) &&
      (category === "all" || c.category === category) &&
      (specialty === "all" ||
        c.specialties.includes(specialty) ||
        c.doctors.some((d) => d.specialties.includes(specialty)))
    );
  });
  const filterCount = [status, category, specialty].filter(
    (v) => v !== "all",
  ).length;
  return (
    <>
      <Heading
        eyebrow="CARTEIRA DE CLIENTES"
        title="Clientes"
        description="Informações essenciais e atalhos para o atendimento, em um só lugar."
        action={
          <Button onClick={() => dialog.current?.showModal()}>
            <Plus size={17} />
            Criar cliente
          </Button>
        }
      />
      {isLoading && <p role="status">Carregando clientes persistidos…</p>}
      {clientsError && <p role="alert" className="field-error">{clientsError.message}</p>}
      <div className="clinic-directory-summary">
        <span>
          <strong>{clients.length}</strong> cadastros
        </span>
        <span>
          <span className="status-dot" />{" "}
          {clients.filter((c) => c.status === "active").length} ativos
        </span>
      </div>
      <div className="clinic-filters">
        <div className="clinic-search">
          <Search size={18} />
          <label className="sr-only" htmlFor="clinic-search">
            Buscar cliente ou profissional
          </label>
          <input
            id="clinic-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, CNPJ, profissional, CRM ou OAB…"
          />
        </div>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
        <Button
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="clinic-extra-filters"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} />
          Filtros {filterCount > 0 && <Badge>{filterCount}</Badge>}
        </Button>
      </div>
      {showFilters && (
        <div className="clinic-extra-filters" id="clinic-extra-filters">
          <label>
            Categoria
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">Todas as categorias</option>
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Especialidade
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              <option value="all">Todas as especialidades</option>
              {specialties.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="section-caption">
        <small>
          {list.length} de {clients.length} cadastros
        </small>
        {(filterCount > 0 || search) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setCategory("all");
              setSpecialty("all");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>
      <p className="sr-only" role="status">
        {notice}
      </p>
      <div className="clinic-directory-grid">
        {list.map((c) => (
          <Card key={c.id} className="clinic-directory-card">
            <div className="clinic-card-heading">
              <ClinicLogo client={c} />
              <div>
                <Badge>{categories[c.category]}</Badge>
                <span className="client-operation-badge" data-vertical={c.vertical}>{clientOperations[c.vertical].name}</span>
                <div className="clinic-name">
                  <h2>{c.name}</h2>
                  <CopyButton value={c.name} label={`nome de ${c.name}`} />
                </div>
                <small>{c.description || "Descrição não informada"}</small>
              </div>
              <Badge tone={c.status === "active" ? "success" : "warning"}>
                {c.status === "active" ? "Ativo" : "Pausado"}
              </Badge>
            </div>
            <div className="clinic-cnpj">
              <div>
                <small>CNPJ</small>
                <strong>{c.cnpj ? formatCnpj(c.cnpj) : "Não informado"}</strong>
              </div>
              <CopyButton
                value={c.cnpj ? formatCnpj(c.cnpj) : null}
                label={`CNPJ de ${c.name}`}
              />
            </div>
            <div className="clinic-specialties">
              <span className="eyebrow">
                {c.category === "organization" || c.vertical === "legal"
                  ? "ÁREAS DE ATUAÇÃO"
                  : "ESPECIALIDADES"}
              </span>
              <div className="actions">
                {[
                  ...new Set([
                    ...c.specialties,
                    ...c.doctors.flatMap((d) => d.specialties),
                  ]),
                ].map((s) => (
                  <span className="specialty-chip" key={s}>
                    {s}
                  </span>
                ))}
                {!c.specialties.length &&
                  !c.doctors.some((d) => d.specialties.length) && (
                    <small>Não informado</small>
                  )}
              </div>
            </div>
            <div className="clinic-doctors">
              <div className="section-caption">
                <h3>
                  {c.category === "organization"
                    ? "Equipe"
                    : c.vertical === "legal"
                      ? "Equipe jurídica"
                      : "Corpo clínico"}{" "}
                  <small>{c.doctors.length} profissional(is)</small>
                </h3>
                <CopyButton
                  value={
                    c.doctors.length
                      ? c.doctors.map((d) => d.name).join("\n")
                      : null
                  }
                  label={`nomes dos profissionais de ${c.name}`}
                />
              </div>
              {c.doctors.map((d) => (
                <div className="doctor-row" key={d.id}>
                  <span className="doctor-avatar">
                    {d.name.replace(/^(Dra?\.)\s*/, "").slice(0, 1)}
                  </span>
                  <div className="doctor-info">
                    <div className="doctor-name">
                      <strong>{d.name}</strong>
                      <CopyButton value={d.name} label={`nome de ${d.name}`} />
                    </div>
                    <small>
                      {d.specialties.join(" · ") ||
                        "Especialidade não informada"}
                    </small>
                    {(c.category !== "organization" || d.crm) && (
                      <div className="doctor-crm">
                        <span>
                          {d.crm
                            ? `${c.vertical === "legal" ? "OAB" : "CRM"}/${d.uf} ${d.crm}`
                            : "Registro não informado"}
                        </span>
                        <CopyButton
                          value={
                            d.crm
                              ? `${c.vertical === "legal" ? "OAB" : "CRM"}/${d.uf} ${d.crm}`
                              : null
                          }
                          label={`${c.vertical === "legal" ? "OAB" : "CRM"} de ${d.name}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!c.doctors.length && (
                <small>Nenhum profissional cadastrado.</small>
              )}
            </div>
            <div className="clinic-card-footer">
              <small>
                {scope.clientIds.includes(c.id) ? repositories.leads.list(c.id).length : 0} leads ·{" "}
                {scope.clientIds.includes(c.id) ? repositories.forms.list(c.id).length : 0} formulários
              </small>
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/app/clientes/${c.id}`}
                onClick={() => setClientId(c.id)}
              >
                Acessar perfil
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {!list.length && (
        <Empty
          title="Nenhum cliente encontrado"
          description="Tente outro nome ou ajuste os filtros da sua busca."
        />
      )}
      <dialog
        ref={dialog}
        className="clinic-dialog"
        aria-labelledby="create-clinic-title"
      >
        <CreateClinic
          onClose={() => dialog.current?.close()}
          onCreated={(name) => {
            dialog.current?.close();
            setSearch("");
            setStatus("all");
            setCategory("all");
            setSpecialty("all");
            setNotice(`${name} criada.`);
          }}
        />
      </dialog>
    </>
  );
}
function CreateClinic({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { mutate } = useClients();
  const [vertical, setVertical] = useState<Client["vertical"]>("healthcare");
  const legal = vertical === "legal";
  const [name, setName] = useState(""),
    [category, setCategory] = useState<Client["category"]>("clinic"),
    [cnpj, setCnpj] = useState(""),
    [logo, setLogo] = useState<string | null>(null),
    [specialties, setSpecialties] = useState(""),
    [description, setDescription] = useState(""),
    [status, setStatus] = useState<Client["status"]>("active"),
    [doctors, setDoctors] = useState<
      { name: string; crm: string; uf: string; specialties: string }[]
    >([]),
    [error, setError] = useState("");
  const internal = category === "organization";
  const practice = internal || legal ? "Áreas de atuação" : "Especialidades";
  const [billing, setBilling] = useState(() => BillingSchema.parse({}));
  const [billingKey, setBillingKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const parseList = (s: string) => [
    ...new Set(
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  function reset() {
    setBilling(BillingSchema.parse({}));
    setBillingKey((v) => v + 1);
    setName("");
    setVertical("healthcare");
    setCategory("clinic");
    setCnpj("");
    setLogo(null);
    setSpecialties("");
    setDescription("");
    setStatus("active");
    setDoctors([]);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const client = ClientSchema.parse({
            id: crypto.randomUUID(),
            organizationId: crypto.randomUUID(),
            billing: {
              ...billing,
              monthlyFeeCents: monthlyFeeCents(
                String(new FormData(e.currentTarget).get("monthlyFee") ?? ""),
              ),
            },
            name,
            category,
            cnpj: cnpj ? cnpj.replace(/\D/g, "") : null,
            logo,
            specialties: parseList(specialties),
            description,
            status,
            vertical,
            branding: legal ? "sage" : "prescrita",
            externalSchedulingUrl: "",
            doctors: doctors.map((d) => ({
              id: crypto.randomUUID(),
              name: d.name,
              crm: internal ? null : d.crm.trim() || null,
              uf: d.uf,
              specialties: parseList(d.specialties),
            })),
          });
          const response = await fetch("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(client) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Não foi possível criar o cliente.");
          await mutate();
          reset();
          onCreated(client.name);
        } catch (e) {
          setError(
            e instanceof z.ZodError
              ? `${e.issues[0].path.join(" → ")}: ${e.issues[0].message}`
              : e instanceof Error
                ? e.message
                : "Não foi possível criar o cadastro",
          );
        }
      }}
    >
      <header className="section-caption">
        <div>
          <p className="eyebrow">NOVO CADASTRO</p>
          <h2 id="create-clinic-title">Criar cliente</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label="Fechar cadastro"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </header>

      <label>
        Operação
        <select
          value={vertical}
          onChange={(e) => {
            const next = e.target.value as Client["vertical"];
            setVertical(next);
            setCategory(clientCategory({ vertical: next, category }));
          }}
        >
          <option value="healthcare">{clientOperations.healthcare.name}</option>
          <option value="legal">{clientOperations.legal.name}</option>
        </select>
      </label>
      <div className="clinic-upload">
        <ClinicLogo client={{ name: name || "Novo cadastro", logo }} />
        <label>
          Logotipo
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                !["image/png", "image/jpeg", "image/webp"].includes(
                  file.type,
                ) ||
                file.size > 1024 * 1024
              ) {
                setError("Escolha PNG, JPG ou WebP de até 1 MB.");
                e.target.value = "";
                return;
              }
              try {
                const data = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                const image = new window.Image();
                image.src = data;
                await image.decode();
                setLogo(data);
                setError("");
              } catch {
                setError("Não foi possível abrir esta imagem.");
              }
            }}
          />
          <small>PNG, JPG ou WebP · até 1 MB</small>
        </label>
        {logo && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setLogo(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Remover
          </Button>
        )}
      </div>
      <label>
        {internal
          ? "Nome da organização *"
          : legal
            ? "Nome do escritório ou profissional *"
            : "Nome da clínica ou profissional *"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
      </label>
      <div className="form-columns">
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Client["category"])}
          >
            {clientOperations[vertical].categories.map((k) => (
              <option key={k} value={k}>
                {categories[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status do cadastro
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Client["status"])}
          >
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
      </div>
      <label>
        CNPJ (opcional)
        <input
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          maxLength={18}
        />
      </label>
      <label>
        Descrição / unidade
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        {practice} (separadas por vírgula)
        <input
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
          placeholder={
            internal
              ? "Marketing, Comercial"
              : legal
                ? "Família, Trabalho"
                : "Ginecologia, Obstetrícia"
          }
        />
      </label>
      <div className="section-caption">
        <h3>Profissionais</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={doctors.length >= 20}
          onClick={() =>
            setDoctors([
              ...doctors,
              { name: "", crm: "", uf: "SP", specialties: "" },
            ])
          }
        >
          <Plus size={15} />
          {internal
            ? "Adicionar profissional"
            : legal
              ? "Adicionar advogado(a)"
              : "Adicionar médico"}
        </Button>
      </div>
      {doctors.map((d, i) => (
        <fieldset className="clinic-doctor-form" key={i}>
          <legend>Profissional {i + 1}</legend>
          {(
            [
              [
                "name",
                internal
                  ? "Nome do profissional *"
                  : legal
                    ? "Nome do advogado(a) *"
                    : "Nome do médico *",
              ],
              [
                "crm",
                legal ? "Número da OAB (opcional)" : "Número do CRM (opcional)",
              ],
              [
                "specialties",
                internal || legal
                  ? "Áreas de atuação"
                  : "Especialidades do médico",
              ],
            ] as const
          )
            .filter(([key]) => !internal || key !== "crm")
            .map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={d[key]}
                  onChange={(e) =>
                    setDoctors(
                      doctors.map((v, j) =>
                        j === i ? { ...v, [key]: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            ))}
          {!internal && (
            <label>
              {legal ? "UF da OAB" : "UF do CRM"}
              <select
                value={d.uf}
                onChange={(e) =>
                  setDoctors(
                    doctors.map((v, j) =>
                      j === i ? { ...v, uf: e.target.value } : v,
                    ),
                  )
                }
              >
                {DoctorSchema.shape.uf.options.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDoctors(doctors.filter((_, j) => i !== j))}
          >
            Remover profissional {i + 1}
          </Button>
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <BillingFields
        key={billingKey}
        value={billing}
        editing
        onChange={setBilling}
      />
      <footer className="clinic-dialog-footer">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">Criar cliente</Button>
      </footer>
    </form>
  );
}
