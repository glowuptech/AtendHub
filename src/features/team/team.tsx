"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Empty } from "@/components/layout/shared";
import { actions, areas, defaults, roles, type Grant, type Role } from "./access";

type ApiClient = { id: string; name: string; status: "active" | "inactive" };
type ApiMember = { id: string; display_name: string; email: string; role: Role; status: "active" | "inactive"; client_access_mode: "all" | "selected"; atendhub_team_client_access: { client_id: string }[]; atendhub_team_member_permissions: { permission_key: string; grant_level: Grant }[] };
type TeamResponse = { members: ApiMember[]; clients: ApiClient[] };
type Draft = { id?: string; displayName: string; email: string; role: Role; status: "active" | "inactive"; clientAccessMode: "all" | "selected"; clientAccess: string[]; permissions: Record<string, Grant> };
const fetcher = (url: string) => fetch(url).then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar a equipe."); return body as TeamResponse; });
const permissionKeys = areas.flatMap((area) => area.actions.map((action) => `${area.id}.${action}`));

function emptyDraft(): Draft { return { displayName: "", email: "", role: "attendant", status: "active", clientAccessMode: "selected", clientAccess: [], permissions: {} }; }
function toDraft(member: ApiMember): Draft { return { id: member.id, displayName: member.display_name, email: "", role: member.role, status: member.status, clientAccessMode: member.client_access_mode, clientAccess: member.atendhub_team_client_access.map((item) => item.client_id), permissions: Object.fromEntries(member.atendhub_team_member_permissions.map((item) => [item.permission_key, item.grant_level])) }; }

export function TeamPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/team", fetcher);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const members = useMemo(() => (data?.members ?? []).filter((member) => `${member.display_name} ${member.email}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || member.status === status)), [data, query, status]);
  const clients = data?.clients ?? [];
  async function save() {
    if (!draft) return;
    setSaving(true); setFormError(""); setNotice("");
    const payload = { displayName: draft.displayName, email: draft.email, role: draft.role, status: draft.status, clientAccessMode: draft.clientAccessMode, clientAccess: draft.clientAccess.map((clientId) => ({ clientId, enabled: true })), permissions: Object.entries(draft.permissions).map(([key, grant]) => ({ key, grant })) };
    const response = await fetch(draft.id ? `/api/team?memberId=${draft.id}` : "/api/team", { method: draft.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) setFormError(body.error ?? "Não foi possível salvar.");
    else { await mutate(); setDraft(null); setNotice(draft.id ? "Funcionário atualizado." : "Convite enviado por e-mail."); }
    setSaving(false);
  }
  return <div className="team-page">
    <div className="section-caption"><div><h2>Equipe</h2><p className="muted">Dados persistidos no Supabase e protegidos por organização.</p></div><Button onClick={() => { setDraft(emptyDraft()); setFormError(""); }}><Plus size={16} />Adicionar funcionário</Button></div>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="field-error" role="alert">{error.message}</p>}
    {draft ? <section className="team-editor" aria-label={draft.id ? "Editar funcionário" : "Adicionar funcionário"}>
      <h3>{draft.id ? "Editar funcionário" : "Novo funcionário"}</h3>
      <div className="form-columns"><label>Nome<input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></label><label>E-mail<input type="email" disabled={Boolean(draft.id)} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label></div>
      <div className="form-columns"><label>Cargo<select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>{Object.entries(roles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div>
      <fieldset><legend>Ações permitidas</legend><div className="team-permission-list">{permissionKeys.map((key) => { const [area, action] = key.split("."); const grant = draft.permissions[key] ?? defaults(draft.role)[key] ?? "none"; return <label key={key}><input type="checkbox" checked={grant !== "none"} onChange={(e) => setDraft({ ...draft, permissions: { ...draft.permissions, [key]: e.target.checked ? (defaults(draft.role)[key] ?? "all") : "none" } })} />{areas.find((item) => item.id === area)?.label} · {actions[action as keyof typeof actions]}</label>; })}</div></fieldset>
      <fieldset><legend>Clientes autorizados</legend><label><input type="radio" checked={draft.clientAccessMode === "all"} onChange={() => setDraft({ ...draft, clientAccessMode: "all" })} /> Todos os clientes atuais e futuros</label><label><input type="radio" checked={draft.clientAccessMode === "selected"} onChange={() => setDraft({ ...draft, clientAccessMode: "selected" })} /> Somente clientes selecionados</label>{draft.clientAccessMode === "selected" && <div className="team-permission-list">{clients.length ? clients.map((client) => <label key={client.id}><input type="checkbox" checked={draft.clientAccess.includes(client.id)} onChange={(e) => setDraft({ ...draft, clientAccess: e.target.checked ? [...draft.clientAccess, client.id] : draft.clientAccess.filter((id) => id !== client.id) })} />{client.name}{client.status === "inactive" ? " · Inativo" : ""}</label>) : <p className="muted">Nenhum cliente persistido nesta organização.</p>}</div>}</fieldset>
      {formError && <p role="alert" className="field-error">{formError}</p>}<div className="actions"><Button onClick={save} disabled={saving || !draft.displayName || (!draft.id && !draft.email)}>{saving && <LoaderCircle className="animate-spin" />}Salvar</Button><Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button></div>
    </section> : <><div className="team-filters"><label>Buscar funcionário<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome" /></label><label>Filtrar status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div>{isLoading ? <p>Carregando equipe…</p> : members.length ? <div className="table-scroll"><table><thead><tr><th>Funcionário</th><th>Cargo</th><th>Status</th><th>Ações</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong><small>{member.email || "E-mail não disponível"}</small></td><td>{roles[member.role]}</td><td><Badge tone={member.status === "active" ? "success" : "neutral"}>{member.status === "active" ? "Ativo" : "Inativo"}</Badge></td><td><Button variant="outline" size="sm" onClick={() => setDraft(toDraft(member))}><Pencil size={14} />Editar</Button></td></tr>)}</tbody></table></div> : <Empty title="Sua equipe começa aqui" description="Adicione funcionários e defina seus cargos e acessos." />}</>}
  </div>;
}
