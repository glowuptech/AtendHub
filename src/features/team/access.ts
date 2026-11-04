import { z } from "zod";
export const roles = {
  attendant: "Atendente",
  manager: "Gerente",
  super_admin: "Superadministrador",
} as const;
export const actions = {
  view: "Visualizar",
  claim: "Assumir",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  export: "Exportar",
  manage: "Gerenciar",
  supervise: "Supervisionar",
} as const;
export const areas = [
  { id: "dashboard", label: "Dashboard geral", actions: ["view", "export"] },
  {
    id: "queue",
    label: "Fila de atendimento",
    actions: ["view", "claim", "manage"],
  },
  {
    id: "clients",
    label: "Clientes",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  {
    id: "inbox",
    label: "Inbox",
    actions: ["view", "edit", "supervise"],
    scoped: true,
  },
  {
    id: "calendar",
    label: "Calendário e agendamentos",
    actions: ["view", "create", "edit", "delete", "export"],
    scoped: true,
  },
  {
    id: "leads",
    label: "Leads e CRM",
    actions: ["view", "create", "edit", "delete", "export"],
    scoped: true,
  },
  {
    id: "forms",
    label: "Formulários",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  {
    id: "knowledge",
    label: "Base de conhecimento",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    id: "traffic",
    label: "Tráfego Pago",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  {
    id: "team",
    label: "Equipe e permissões",
    actions: ["view", "create", "edit", "manage"],
  },
  {
    id: "hours",
    label: "Calendário de atendimento",
    actions: ["view", "edit"],
  },
  {
    id: "billing",
    label: "Faturas e cobranças",
    actions: ["view", "create", "edit", "delete", "export"],
  },
  {
    id: "commissions",
    label: "Comissões",
    actions: ["view", "edit", "export"],
    scoped: true,
  },
  { id: "whatsapp", label: "Conexão WhatsApp", actions: ["view", "manage"] },
  { id: "webhooks", label: "Webhooks", actions: ["view", "manage"] },
  { id: "backup", label: "Backup", actions: ["view", "manage"] },
  { id: "database", label: "Banco de dados", actions: ["view", "manage"] },
] as const;
export type Role = keyof typeof roles;
export type Grant = "none" | "own" | "team" | "all";
export const permissionKeys = areas.flatMap((area) =>
  area.actions.map((action) => `${area.id}.${action}`),
);
export function defaults(role: Role): Record<string, Grant> {
  const grants: Record<string, Grant> = Object.fromEntries(
    permissionKeys.map((key) => [key, "none"]),
  );
  if (role === "super_admin")
    return Object.fromEntries(permissionKeys.map((key) => [key, "all"]));
  const allow = (area: string, list: string[], grant: Grant = "all") =>
    list.forEach((action) => {
      grants[`${area}.${action}`] = grant;
    });
  allow("queue", ["view", "claim"]);
  allow("clients", ["view"]);
  allow("knowledge", ["view"]);
  allow("hours", ["view"]);
  allow("inbox", ["view", "edit"], "own");
  allow("leads", ["view", "edit"], role === "manager" ? "team" : "own");
  allow(
    "calendar",
    ["view", "create", "edit"],
    role === "manager" ? "team" : "own",
  );
  allow("commissions", ["view"], role === "manager" ? "team" : "own");
  if (role === "manager") {
    allow("queue", ["manage"]);
    allow("dashboard", ["view"]);
    allow("clients", ["create", "edit"]);
    allow("inbox", ["supervise"], "team");
    allow("leads", ["create"], "team");
    allow("forms", ["view", "create", "edit"]);
    allow("knowledge", ["create", "edit"]);
    allow("traffic", ["view"]);
    allow("team", ["view"]);
    allow("hours", ["edit"]);
  }
  return grants;
}
export const MemberSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    name: z.string().trim().min(2, "Informe o nome completo.").max(120),
    email: z
      .string()
      .trim()
      .email("Informe um e-mail válido.")
      .transform((v) => v.toLowerCase()),
    role: z.enum(["attendant", "manager", "super_admin"]),
    active: z.boolean(),
    overrides: z.record(z.string(), z.enum(["none", "own", "team", "all"])),
    clientAccess: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("all") }),
      z.object({
        mode: z.literal("selected"),
        ids: z.array(z.string().uuid()),
      }),
    ]),
  })
  .superRefine((member, ctx) => {
    for (const [key, value] of Object.entries(member.overrides)) {
      if (
        member.role !== "super_admin" &&
        ["team.create", "team.edit", "team.manage"].includes(key) &&
        value !== "none"
      )
        ctx.addIssue({
          code: "custom",
          path: ["overrides"],
          message: "Gerenciar funcionários é exclusivo do superadministrador.",
        });
      const area = areas.find((area) => key.startsWith(`${area.id}.`));
      if (
        !permissionKeys.includes(key) ||
        (!("scoped" in (area ?? {})) && ["own", "team"].includes(value))
      )
        ctx.addIssue({
          code: "custom",
          path: ["overrides"],
          message: "Permissão inválida.",
        });
    }
  });
export type Member = z.infer<typeof MemberSchema>;
export function grantFor(
  member: Pick<Member, "role" | "overrides">,
  key: string,
): Grant {
  return member.overrides[key] ?? defaults(member.role)[key] ?? "none";
}
// This pure evaluator is ready for reuse on a future trusted server. Browser state
// is not authentication. Caller must resolve client and record relationship there.
export function canAccess(
  member: Member,
  input: {
    organizationId: string;
    permission: string;
    clientId?: string;
    relation?: "own" | "team" | "other";
  },
) {
  if (
    !member.active ||
    member.organizationId !== input.organizationId ||
    !permissionKeys.includes(input.permission)
  )
    return false;
  if (
    input.clientId &&
    member.clientAccess.mode === "selected" &&
    !member.clientAccess.ids.includes(input.clientId)
  )
    return false;
  const [area, action] = input.permission.split(".");
  if (
    ["clients", "inbox", "calendar", "leads", "forms", "knowledge"].includes(
      area,
    ) &&
    !input.clientId &&
    !(area === "clients" && action === "create")
  )
    return false;
  if (
    ["team.create", "team.edit", "team.manage"].includes(input.permission) &&
    member.role !== "super_admin"
  )
    return false;
  const grant = grantFor(member, input.permission);
  return (
    grant === "all" ||
    (grant === "own" && input.relation === "own") ||
    (grant === "team" && ["own", "team"].includes(input.relation ?? ""))
  );
}
export function saveMember(
  current: Member[],
  raw: unknown,
  organizationId: string,
  allowedClients: readonly string[],
): Member[] {
  const member = MemberSchema.parse(raw);
  if (member.organizationId !== organizationId)
    throw Error("Funcionário fora da organização.");
  if (
    member.clientAccess.mode === "selected" &&
    member.clientAccess.ids.some((id) => !allowedClients.includes(id))
  )
    throw Error("Cliente não autorizado nesta organização.");
  if (
    current.some(
      (existing) =>
        existing.id !== member.id &&
        existing.email.toLowerCase() === member.email,
    )
  )
    throw Error("Este e-mail já está cadastrado na equipe.");
  const normalized = Object.fromEntries(
    Object.entries(member.overrides).filter(
      ([key, value]) => defaults(member.role)[key] !== value,
    ),
  );
  const saved = { ...member, overrides: normalized };
  return current.some((existing) => existing.id === saved.id)
    ? current.map((existing) => (existing.id === saved.id ? saved : existing))
    : [...current, saved];
}
