import { test, expect } from "vitest";
import {
  defaults,
  saveMember,
  canAccess,
  type Member,
} from "@/features/team/access";
import { organizationId, clientA, clientB } from "@/lib/mocks/fixtures";
const member: Member = {
  id: "00000000-0000-4000-8000-000000000999",
  organizationId,
  name: "Ana Silva",
  email: "ana@example.com",
  role: "attendant",
  active: true,
  overrides: {},
  clientAccess: { mode: "selected", ids: [clientA] },
};
test("cargos restringem ações e supervisão", () => {
  expect(defaults("attendant")["queue.claim"]).toBe("all");
  expect(defaults("attendant")["queue.manage"]).toBe("none");
  expect(defaults("manager")["queue.manage"]).toBe("all");
  expect(defaults("attendant")["billing.view"]).toBe("none");
  expect(defaults("manager")["team.manage"]).toBe("none");
  expect(defaults("super_admin")["team.manage"]).toBe("all");
  expect(
    canAccess(member, {
      organizationId,
      permission: "inbox.view",
      clientId: clientA,
      relation: "own",
    }),
  ).toBe(true);
  expect(
    canAccess(member, {
      organizationId,
      permission: "inbox.view",
      clientId: clientA,
      relation: "other",
    }),
  ).toBe(false);
  expect(
    canAccess(
      { ...member, role: "manager" },
      {
        organizationId,
        permission: "inbox.supervise",
        clientId: clientA,
        relation: "team",
      },
    ),
  ).toBe(true);
});
test("nega inativos, outra organização, clientes não selecionados e contexto ausente", () => {
  const input = {
    organizationId,
    permission: "clients.view",
    clientId: clientA,
  };
  expect(canAccess({ ...member, active: false }, input)).toBe(false);
  expect(canAccess(member, { ...input, organizationId: clientB })).toBe(false);
  expect(
    canAccess(
      { ...member, role: "super_admin" },
      { ...input, clientId: clientB },
    ),
  ).toBe(false);
  expect(
    canAccess(member, { organizationId, permission: "clients.view" }),
  ).toBe(false);
  expect(
    canAccess(
      { ...member, clientAccess: { mode: "all" } },
      { ...input, clientId: clientB },
    ),
  ).toBe(true);
  expect(
    canAccess({ ...member, overrides: { "clients.view": "none" } }, input),
  ).toBe(false);
});
test("salva, normaliza, edita sem duplicar e rejeita e-mail e escopo inválidos", () => {
  const stored = saveMember(
    [],
    { ...member, email: " ANA@EXAMPLE.COM " },
    organizationId,
    [clientA],
  );
  expect(stored[0].email).toBe("ana@example.com");
  expect(
    saveMember(stored, { ...member, name: "Ana Souza" }, organizationId, [
      clientA,
    ]),
  ).toHaveLength(1);
  expect(() =>
    saveMember(stored, { ...member, id: clientB }, organizationId, [clientA]),
  ).toThrow("já está cadastrado");
  expect(() =>
    saveMember(
      [],
      { ...member, clientAccess: { mode: "selected", ids: [clientB] } },
      organizationId,
      [clientA],
    ),
  ).toThrow("não autorizado");
  expect(() =>
    saveMember(
      [],
      { ...member, overrides: { "inventado.view": "all" } },
      organizationId,
      [clientA],
    ),
  ).toThrow();
});
test("gerenciamento da equipe não pode ser delegado a outros cargos", () => {
  expect(
    canAccess(
      { ...member, role: "manager", overrides: { "team.create": "all" } },
      { organizationId, permission: "team.create" },
    ),
  ).toBe(false);
  expect(() =>
    saveMember(
      [],
      { ...member, overrides: { "team.manage": "all" } },
      organizationId,
      [clientA],
    ),
  ).toThrow("exclusivo");
});
