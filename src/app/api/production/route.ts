import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { paidMediaAdmin, allRows } from "@/features/paid-media/server";
import { taskInput, workflow, type Task } from "@/features/production/model";
import { tenantSlug } from "@/features/client-domains/model";
const message = (error: string, status: number) =>
  Response.json({ error }, { status });
async function handle(request: Request) {
  if (tenantSlug(request.headers.get("host")))
    return message("Área da equipe operacional.", 403);
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const admin = paidMediaAdmin();
  const org = auth.organizationId;
  const grants = await admin
    .from("atendhub_team_member_permissions")
    .select("permission_key,grant_level")
    .eq("organization_id", org)
    .eq("team_member_id", auth.userId)
    .in("permission_key", [
      "production.view",
      "production.create",
      "production.edit",
    ]);
  if (grants.error) throw grants.error;
  const can = (action: string) =>
    auth.role === "super_admin" ||
    grants.data.some(
      (p) =>
        p.permission_key === "production." + action && p.grant_level === "all",
    );
  if (!can("view"))
    return message("Peça acesso a Produção ao administrador.", 403);
  let clients = await allRows<{ id: string; name: string }>((a, b) =>
    auth.supabase
      .from("atendhub_clients")
      .select("id,name")
      .eq("organization_id", org)
      .order("id")
      .range(a, b),
  );
  if (auth.role !== "super_admin") {
    const member = await admin
      .from("atendhub_team_members")
      .select("client_access_mode")
      .eq("id", auth.userId)
      .eq("organization_id", org)
      .single();
    if (member.error) throw member.error;
    if (member.data.client_access_mode !== "all") {
      const links = await allRows<{ client_id: string }>((a, b) =>
        admin
          .from("atendhub_team_client_access")
          .select("client_id")
          .eq("organization_id", org)
          .eq("team_member_id", auth.userId)
          .order("client_id")
          .range(a, b),
      );
      const visible = new Set(links.map((l) => l.client_id));
      clients = clients.filter((c) => visible.has(c.id));
    }
  }
  const client = new URL(request.url).searchParams.get("clientId");
  const allowed = clients
    .filter((c) => !client || c.id === client)
    .map((c) => c.id);
  if (client && !allowed.length) return message("Cliente indisponível.", 403);
  const table = admin.from("atendhub_production_tasks");
  const taskId = new URL(request.url).searchParams.get("files");
  if (taskId !== null) {
    if (!client || !z.string().uuid().safeParse(taskId).success)
      return message("Demanda inválida.", 400);
    const task = await table.select("id").eq("id", taskId)
      .eq("organization_id", org).eq("client_id", client).maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) return message("Demanda indisponível.", 404);
    const folder = [org, client, taskId].join("/");
    const bucket = admin.storage.from("production-files");
    if (request.method === "GET") {
      const names: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await bucket.list(folder, { limit: 100, offset, sortBy: { column: "name", order: "desc" } });
        if (page.error) throw page.error;
        names.push(...page.data.map(file => file.name));
        if (page.data.length < 100) break;
      }
      return Response.json({ names });
    }
    const body = await request.json();
    if (request.method === "POST" && body.action === "read") {
      if (typeof body.name !== "string" || !/^[\w.-]+$/.test(body.name) || body.name.startsWith("."))
        return message("Arquivo inválido.", 400);
      const signed = await bucket.createSignedUrl(folder + "/" + body.name, 3600);
      if (signed.error) throw signed.error;
      return Response.json({ url: signed.data.signedUrl });
    }
    if (request.method !== "POST" || !can("edit")) return message("Sem acesso para enviar arquivos.", 403);
    if (body.action !== "upload" || typeof body.name !== "string" || !/\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(body.name))
      return message("Selecione uma imagem ou um vídeo compatível.", 400);
    const name = body.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
    const path = folder + "/" + Date.now() + "-" + crypto.randomUUID() + "-" + name;
    const signed = await bucket.createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    return Response.json({ path, signature: signed.data.token });
  }
  if (request.method === "GET") {
    const tasks = allowed.length
      ? await allRows<Task>((a, b) =>
          table
            .select("*,owner:atendhub_team_members!atendhub_production_tasks_owner_id_fkey(display_name),plan:atendhub_campaign_plans(name)")
            .eq("organization_id", org)
            .in("client_id", allowed)
            .order("created_at", { ascending: false })
            .order("id")
            .range(a, b),
        )
      : [];
    const plans = client
      ? await allRows<{
          id: string;
          name: string;
          objective: string;
          audience: string;
          stages: Record<string, { creative: string; hypothesis: string }>;
        }>((a, b) =>
          admin
            .from("atendhub_campaign_plans")
            .select("id,name,objective,audience,stages")
            .eq("organization_id", org)
            .eq("client_id", client)
            .neq("status", "archived")
            .order("name")
            .order("id")
            .range(a, b),
        )
      : [];
    return Response.json({
      clients,
      tasks,
      plans,
      userId: auth.userId,
      canCreate: can("create"),
      canEdit: can("edit"),
    });
  }
  const body = await request.json().catch(() => null);
  if (request.method === "POST") {
    if (!can("create"))
      return message("Sem permissão para criar demandas.", 403);
    const input = taskInput.safeParse(body);
    if (!input.success)
      return message(
        input.error.issues[0]?.message ?? "Confira a demanda.",
        400,
      );
    const t = input.data;
    if (!allowed.includes(t.client_id))
      return message("Cliente indisponível.", 403);
    const { error } = await table.insert({
      ...t,
      organization_id: org,
      created_by: auth.userId,
      stage: workflow[t.kind][0],
    });
    if (error)
      return message(
        "Não foi possível salvar. Confira o cliente e o planejamento.",
        409,
      );
    return Response.json({ id: t.id }, { status: 201 });
  }
  if (!can("edit"))
    return message("Sem permissão para atualizar demandas.", 403);
  if (body?.action === "edit") {
    const input = taskInput.safeParse(body);
    if (!input.success || !Number.isInteger(body.revision))
      return message("Confira a demanda e os prazos.", 400);
    const { id, client_id, kind, ...values } = input.data;
    if (!allowed.includes(client_id))
      return message("Cliente indisponível.", 403);
    const result = await table
      .update({ ...values, revision: body.revision + 1 })
      .eq("id", id)
      .eq("organization_id", org)
      .eq("client_id", client_id)
      .eq("kind", kind)
      .eq("revision", body.revision)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      return message(
        "Não foi possível editar. Atualize a demanda e confira o planejamento.",
        409,
      );
    return Response.json(result.data);
  }
  const input = z
    .object({
      id: z.uuid(),
      revision: z.number().int().positive(),
      action: z.enum(["move", "claim", "release"]),
      stage: z.string().optional(),
    })
    .safeParse(body);
  if (!input.success) return message("Alteração inválida.", 400);
  const { id, revision, action, stage } = input.data;
  const { data: task, error } = await table
    .select("client_id,kind,owner_id")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!task || !allowed.includes(task.client_id))
    return message("Demanda indisponível.", 404);
  const steps: readonly string[] = workflow[task.kind as Task["kind"]];
  if (action === "move" && (!stage || !steps.includes(stage)))
    return message("Etapa inválida.", 400);
  if (
    action !== "move" &&
    (action === "claim" ? !!task.owner_id : task.owner_id !== auth.userId)
  )
    return message("Responsável já alterado.", 409);
  const result = await table
    .update({
      revision: revision + 1,
      ...(action === "move"
        ? { stage }
        : { owner_id: action === "claim" ? auth.userId : null }),
    })
    .eq("organization_id", org)
    .eq("id", id)
    .eq("revision", revision)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data
    ? Response.json(result.data)
    : message("A demanda mudou. Confira a versão atual.", 409);
}
async function route(request: Request) {
  try {
    return await handle(request);
  } catch {
    return message("Não foi possível consultar a produção.", 500);
  }
}
export { route as GET, route as POST, route as PATCH };
