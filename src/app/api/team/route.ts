import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// This project does not yet generate Supabase Database types; the route still validates every payload with Zod.
// Supabase Database types will be generated once the shared project schema is published.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createAdminClient<any>>;
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["attendant", "manager", "super_admin"]);
const accessModeSchema = z.enum(["all", "selected"]);
const permissionSchema = z.object({ key: z.string().regex(/^[a-z_]+\.[a-z_]+$/), grant: z.enum(["none", "own", "team", "all"]) });
const accessSchema = z.object({ clientId: z.string().uuid(), enabled: z.boolean() });
const memberSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  role: roleSchema,
  status: z.enum(["active", "inactive"]),
  clientAccessMode: accessModeSchema,
  permissions: z.array(permissionSchema).max(100),
  clientAccess: z.array(accessSchema).max(1000),
});

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) } as const;
  const { data: membership, error } = await supabase.from("atendhub_team_members").select("id, organization_id, role, status").eq("id", user.id).eq("status", "active").maybeSingle();
  if (error || !membership || membership.role !== "super_admin") return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) } as const;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) return { error: NextResponse.json({ error: "Configuração segura incompleta." }, { status: 500 }) } as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient<any>(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  return { admin: admin as AdminClient, organizationId: membership.organization_id, userId: user.id } as const;
}

function responseError(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a equipe." }, { status });
}

export async function GET() {
  const auth = await context();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.admin.from("atendhub_team_members").select("id, organization_id, display_name, role, status, client_access_mode, atendhub_team_client_access(client_id), atendhub_team_member_permissions(permission_key, grant_level)").eq("organization_id", auth.organizationId).order("display_name");
  if (error) return responseError(error, 500);
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await context();
  if ("error" in auth) return auth.error;
  const parsed = memberSchema.safeParse(await request.json());
  if (!parsed.success) return responseError(parsed.error.issues[0]?.message);
  const input = parsed.data;
  const email = input.email;
  if (!email) return responseError("Informe um e-mail para enviar o convite.");
  const { data: existing } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.users.some((item) => item.email?.toLowerCase() === email.toLowerCase())) return NextResponse.json({ error: "Este e-mail já existe no Auth compartilhado. Confirme a conta explicitamente antes de vinculá-la." }, { status: 409 });
  const { data: invited, error: inviteError } = await auth.admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited.user) return responseError(inviteError ?? new Error("Não foi possível enviar o convite."));
  const { error: memberError } = await auth.admin.from("atendhub_team_members").insert({ id: invited.user.id, organization_id: auth.organizationId, display_name: input.displayName, role: input.role, status: input.status, client_access_mode: input.clientAccessMode });
  if (memberError) { await auth.admin.auth.admin.deleteUser(invited.user.id); return responseError(memberError); }
  await persistAccess(auth.admin, auth.organizationId, invited.user.id, input);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await context();
  if ("error" in auth) return auth.error;
  const memberId = new URL(request.url).searchParams.get("memberId");
  if (!memberId || !z.string().uuid().safeParse(memberId).success) return responseError("Funcionário inválido.");
  if (memberId === auth.userId) return responseError("Você não pode alterar o próprio cargo ou status.", 403);
  const parsed = memberSchema.safeParse(await request.json());
  if (!parsed.success) return responseError(parsed.error.issues[0]?.message);
  const input = parsed.data;
  const { error: memberError } = await auth.admin.from("atendhub_team_members").update({ display_name: input.displayName, role: input.role, status: input.status, client_access_mode: input.clientAccessMode, updated_at: new Date().toISOString() }).eq("id", memberId).eq("organization_id", auth.organizationId);
  if (memberError) return responseError(memberError);
  await persistAccess(auth.admin, auth.organizationId, memberId, input);
  return NextResponse.json({ ok: true });
}

async function persistAccess(admin: AdminClient, organizationId: string, memberId: string, input: z.infer<typeof memberSchema>) {
  await admin.from("atendhub_team_client_access").delete().eq("team_member_id", memberId).eq("organization_id", organizationId);
  const selected = input.clientAccessMode === "selected" ? input.clientAccess.filter((item) => item.enabled).map((item) => ({ team_member_id: memberId, organization_id: organizationId, client_id: item.clientId })) : [];
  if (selected.length) await admin.from("atendhub_team_client_access").insert(selected);
  await admin.from("atendhub_team_member_permissions").delete().eq("team_member_id", memberId).eq("organization_id", organizationId);
  const permissions = input.permissions.filter((item) => item.grant !== "none").map((item) => ({ team_member_id: memberId, organization_id: organizationId, permission_key: item.key, grant_level: item.grant }));
  if (permissions.length) await admin.from("atendhub_team_member_permissions").insert(permissions);
}
