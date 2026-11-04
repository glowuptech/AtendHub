"use client";
import { useState } from "react";
import { Plus, RotateCcw, Pencil } from "lucide-react";
import { z } from "zod";
import { useDemo } from "@/components/layout/demo-context";
import { Button } from "@/components/ui/button";
import { Badge, Empty } from "@/components/layout/shared";
import {
  roles,
  actions,
  areas,
  defaults,
  grantFor,
  saveMember,
  type Member,
  type Role,
  type Grant,
} from "./access";
export function TeamPage() {
  const { scope, repositories, teamMembers, setTeamMembers } = useDemo();
  const [query, setQuery] = useState(""),
    [role, setRole] = useState("all"),
    [status, setStatus] = useState("all"),
    [draft, setDraft] = useState<Member | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [clientQuery, setClientQuery] = useState(""),
    [operation, setOperation] = useState("all");
  const clients = repositories.clients.list(scope);
  const filtered = teamMembers.filter(
    (member) =>
      member.organizationId === scope.organizationId &&
      `${member.name} ${member.email}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (role === "all" || member.role === role) &&
      (status === "all" || member.active === (status === "active")),
  );
  function edit(member: Member) {
    setDraft(structuredClone(member));
    setError("");
    setNotice("");
    setPendingRole(null);
    setClientQuery("");
    setOperation("all");
  }
  function changeRole(next: Role) {
    if (!draft) return;
    if (Object.keys(draft.overrides).length) setPendingRole(next);
    else setDraft({ ...draft, role: next, overrides: {} });
  }
  function override(key: string, value: Grant) {
    if (!draft) return;
    const next = { ...draft.overrides };
    if (defaults(draft.role)[key] === value) delete next[key];
    else next[key] = value;
    setDraft({ ...draft, overrides: next });
  }
  return (
    <div className="team-page">
      <div className="section-caption">
        <div>
          <h2>Equipe</h2>
          <p className="muted">Cargos, acessos e clientes autorizados.</p>
        </div>
        <Button
          onClick={() =>
            edit({
              id: crypto.randomUUID(),
              organizationId: scope.organizationId,
              name: "",
              email: "",
              role: "attendant",
              active: true,
              overrides: {},
              clientAccess: { mode: "selected", ids: [] },
            })
          }
        >
          <Plus size={16} />
          Adicionar funcionário
        </Button>
      </div>
      <p className="team-note">
        Cadastros em memória nesta sessão. Convites, autenticação e aplicação
        das permissões no servidor serão conectados depois.
      </p>
      {notice && <p role="status">{notice}</p>}
      {draft ? (
        <form
          className="team-editor"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const saved = saveMember(
                teamMembers,
                draft,
                scope.organizationId,
                clients.map((c) => c.id),
              );
              setTeamMembers(saved);
              setDraft(null);
              setNotice("Funcionário salvo nesta sessão.");
            } catch (e) {
              setError(
                e instanceof z.ZodError
                  ? e.issues[0].message
                  : e instanceof Error
                    ? e.message
                    : "Confira os dados.",
              );
            }
          }}
        >
          <h3>
            {teamMembers.some((member) => member.id === draft.id)
              ? "Editar funcionário"
              : "Novo funcionário"}
          </h3>
          <fieldset>
            <legend>Dados pessoais</legend>
            <div className="form-columns">
              <label>
                Nome
                <input
                  value={draft.name}
                  autoComplete="off"
                  maxLength={120}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="off"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Cargo e acessos</legend>
            <label>
              Cargo
              <select
                value={draft.role}
                onChange={(e) => changeRole(e.target.value as Role)}
              >
                {Object.entries(roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {pendingRole && (
              <div role="alert" className="team-role-warning">
                <p>
                  Trocar para {roles[pendingRole]} substituirá as permissões
                  personalizadas pelos padrões do novo cargo.
                </p>
                <div className="actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setDraft({ ...draft, role: pendingRole, overrides: {} });
                      setPendingRole(null);
                    }}
                  >
                    Confirmar troca de cargo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingRole(null)}
                  >
                    Manter cargo atual
                  </Button>
                </div>
              </div>
            )}
            <div className="section-caption">
              <Badge>
                {Object.keys(draft.overrides).length
                  ? "Permissões personalizadas"
                  : "Padrão do cargo"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!Object.keys(draft.overrides).length}
                onClick={() => setDraft({ ...draft, overrides: {} })}
              >
                <RotateCcw size={14} />
                Restaurar padrão do cargo
              </Button>
            </div>
            <p className="muted">
              Próprios: registros atribuídos à pessoa. Equipe: registros da
              equipe sob sua supervisão. Todo acesso continua limitado aos
              clientes autorizados. Comissões são permissões previstas, sem
              cálculo nesta etapa.
            </p>
            <div
              className="table-scroll team-permissions"
              tabIndex={0}
              aria-label="Matriz de permissões"
            >
              <table>
                <caption className="sr-only">
                  Permissões por área e ação
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Área</th>
                    {Object.entries(actions).map(([key, label]) => (
                      <th key={key} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areas.map((area) => (
                    <tr key={area.id}>
                      <th scope="row">{area.label}</th>
                      {Object.entries(actions).map(([action, label]) => {
                        const key = `${area.id}.${action}`,
                          applies = (
                            area.actions as readonly string[]
                          ).includes(action),
                          grant = grantFor(draft, key);
                        return (
                          <td key={action}>
                            {applies ? (
                              "scoped" in area ? (
                                <select
                                  aria-label={`${area.label}: ${label}`}
                                  value={grant}
                                  onChange={(e) =>
                                    override(key, e.target.value as Grant)
                                  }
                                >
                                  <option value="none">Sem acesso</option>
                                  <option value="own">Próprios</option>
                                  <option value="team">Equipe</option>
                                  <option value="all">Permitido</option>
                                </select>
                              ) : (
                                <input
                                  type="checkbox"
                                  disabled={
                                    area.id === "team" &&
                                    action !== "view" &&
                                    draft.role !== "super_admin"
                                  }
                                  title={
                                    area.id === "team" && action !== "view"
                                      ? "Exclusivo do superadministrador"
                                      : undefined
                                  }
                                  aria-label={`${area.label}: ${label}`}
                                  checked={grant !== "none"}
                                  onChange={(e) =>
                                    override(
                                      key,
                                      e.target.checked ? "all" : "none",
                                    )
                                  }
                                />
                              )
                            ) : (
                              <span aria-label="Não se aplica">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          <fieldset>
            <legend>Clientes autorizados</legend>
            <p>
              O cargo define o que a pessoa pode fazer; esta seleção define em
              quais clientes.
            </p>
            <label className="check-option">
              <input
                type="radio"
                name="client-access"
                checked={draft.clientAccess.mode === "selected"}
                onChange={() =>
                  setDraft({
                    ...draft,
                    clientAccess: { mode: "selected", ids: [] },
                  })
                }
              />
              Somente clientes selecionados
            </label>
            <label className="check-option">
              <input
                type="radio"
                name="client-access"
                checked={draft.clientAccess.mode === "all"}
                onChange={() =>
                  setDraft({ ...draft, clientAccess: { mode: "all" } })
                }
              />
              Todos os clientes atuais e futuros
            </label>
            {draft.clientAccess.mode === "all" ? (
              <p className="team-note">
                Novos clientes desta organização entram automaticamente no
                escopo deste funcionário.
              </p>
            ) : (
              <>
                <div className="form-columns">
                  <label>
                    Buscar cliente
                    <input
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    Operação
                    <select
                      value={operation}
                      onChange={(e) => setOperation(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      <option value="healthcare">Prescrita</option>
                      <option value="legal">Veredite</option>
                    </select>
                  </label>
                </div>
                <p>
                  {draft.clientAccess.ids.length} clientes selecionados. Novos
                  clientes precisarão de autorização manual.
                </p>
                <div className="team-client-list">
                  {clients
                    .filter(
                      (c) =>
                        c.name
                          .toLowerCase()
                          .includes(clientQuery.toLowerCase()) &&
                        (operation === "all" || c.vertical === operation),
                    )
                    .map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          checked={
                            draft.clientAccess.mode === "selected" &&
                            draft.clientAccess.ids.includes(c.id)
                          }
                          onChange={(e) => {
                            if (draft.clientAccess.mode !== "selected") return;
                            setDraft({
                              ...draft,
                              clientAccess: {
                                mode: "selected",
                                ids: e.target.checked
                                  ? [...draft.clientAccess.ids, c.id]
                                  : draft.clientAccess.ids.filter(
                                      (id) => id !== c.id,
                                    ),
                              },
                            });
                          }}
                        />
                        <span>
                          {c.name}
                          <small>
                            {c.vertical === "healthcare"
                              ? "Prescrita · Saúde"
                              : "Veredite · Jurídico"}{" "}
                            ·{" "}
                            {c.category === "clinic"
                              ? "Clínica"
                              : "Profissional"}
                          </small>
                        </span>
                      </label>
                    ))}
                  {!clients.some(
                    (c) =>
                      c.name
                        .toLowerCase()
                        .includes(clientQuery.toLowerCase()) &&
                      (operation === "all" || c.vertical === operation),
                  ) && <p>Nenhum cliente neste filtro.</p>}
                </div>
              </>
            )}
          </fieldset>
          <fieldset>
            <legend>Status</legend>
            <label className="check-option">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Funcionário ativo
            </label>
            <small>
              Funcionários inativos têm acesso negado na avaliação de
              permissões.
            </small>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="actions team-save">
            <Button type="submit" disabled={!!pendingRole}>
              Salvar funcionário
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(null);
                setPendingRole(null);
                setError("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="team-filters">
            <label>
              Buscar funcionário
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome ou e-mail"
              />
            </label>
            <label>
              Filtrar cargo
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="all">Todos</option>
                {Object.entries(roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Filtrar status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
          </div>
          {filtered.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              aria-label="Funcionários da equipe"
            >
              <table>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Cargo</th>
                    <th>Status</th>
                    <th>Acessos</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </td>
                      <td>{roles[member.role]}</td>
                      <td>
                        <Badge tone={member.active ? "success" : "neutral"}>
                          {member.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td>
                        <small>
                          {Object.keys(member.overrides).length
                            ? "Personalizados"
                            : "Padrão do cargo"}
                        </small>
                        <small>
                          {member.clientAccess.mode === "all"
                            ? "Todos os clientes"
                            : `${member.clientAccess.ids.length} clientes`}
                        </small>
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => edit(member)}
                        >
                          <Pencil size={14} />
                          Editar acessos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={
                teamMembers.length
                  ? "Nenhum funcionário encontrado"
                  : "Sua equipe começa aqui"
              }
              description="Adicione funcionários e defina seus cargos e acessos."
            />
          )}
        </>
      )}
    </div>
  );
}
