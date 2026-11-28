import { notFound, redirect } from "next/navigation";
import { brandedPortalContext } from "@/features/client-domains/portal";
import { requireAtendhubMembership } from "@/lib/supabase/access";
import { paidMediaAdmin } from "@/features/paid-media/server";

async function access() {
  const { membership, user } = await requireAtendhubMembership();
  const portal = await brandedPortalContext();
  if (!portal || portal.client.organization_id !== membership.organization_id)
    notFound();
  const admin = paidMediaAdmin();
  if (
    membership.role !== "super_admin" &&
    membership.client_access_mode !== "all"
  ) {
    const link = await admin
      .from("atendhub_team_client_access")
      .select("client_id")
      .eq("organization_id", membership.organization_id)
      .eq("team_member_id", user.id)
      .eq("client_id", portal.client.id)
      .maybeSingle();
    if (link.error || !link.data) notFound();
  }
  return { admin, client: portal.client, user };
}

async function decide(form: FormData) {
  "use server";
  const { admin, client, user } = await access();
  const action = form.get("decision");
  const feedback = String(form.get("feedback") || "").trim();
  if (action !== "approved" && action !== "changes") notFound();
  if (action === "changes" && !feedback)
    redirect("/portal/aprovacoes?status=comentario");
  const { error } = await admin.rpc("atendhub_production_approval", {
    p_client: client.id,
    p_org: client.organization_id,
    p_actor: user.id,
    p_action: action,
    p_task: form.get("task"),
    p_approval: form.get("approval"),
    p_feedback: feedback,
  });
  redirect("/portal/aprovacoes?status=" + (error ? "indisponivel" : "salvo"));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { admin, client } = await access();
  const result = await admin
    .from("atendhub_production_approvals")
    .select(
      "id,file_name,task:atendhub_production_tasks!inner(id,title,organization_id,client_id)",
    )
    .eq("task.organization_id", client.organization_id)
    .eq("task.client_id", client.id)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .returns<
      { id: string; file_name: string; task: { id: string; title: string } }[]
    >();
  if (result.error) throw result.error;
  const status = (await searchParams).status;
  const cards = await Promise.all(
    result.data.map(async (row) => {
      const { data } = await admin.storage
        .from("production-files")
        .createSignedUrl(
          [client.organization_id, client.id, row.task.id, row.file_name].join(
            "/",
          ),
          3600,
        );
      return (
        <article key={row.id} id={`versao-${row.id}`}>
          <h3>{row.task.title}</h3>
          <p>{row.file_name.slice(51)}</p>
          {data &&
            (/\.(mp4|mov|webm)$/i.test(row.file_name) ? (
              <video
                controls
                playsInline
                preload="metadata"
                style={{ maxWidth: "100%", maxHeight: 480 }}
                src={data.signedUrl}
              />
            ) : (
              <img
                alt={row.task.title}
                style={{ maxWidth: "100%", maxHeight: 480 }}
                src={data.signedUrl}
              />
            ))}
          {data ? (
            <form action={decide}>
              <input type="hidden" name="task" value={row.task.id} />
              <input type="hidden" name="approval" value={row.id} />
              <label>
                Comentário para a equipe
                <textarea name="feedback" maxLength={2000} />
              </label>
              <button name="decision" value="approved">
                Aprovar versão
              </button>
              <button name="decision" value="changes">
                Solicitar ajustes
              </button>
            </form>
          ) : (
            <p>
              Arquivo indisponível. Atualize a página para tentar novamente.
            </p>
          )}
        </article>
      );
    }),
  );
  return (
    <section>
      <h2>Aprovações</h2>
      {status === "salvo" && <p role="status">Decisão registrada.</p>}
      {status === "comentario" && (
        <p role="alert">Descreva o ajuste antes de enviar.</p>
      )}
      {status === "indisponivel" && (
        <p role="alert">
          Não foi possível registrar sua decisão. Confira a versão atual.
        </p>
      )}
      {cards.length ? cards : <p>Nenhuma peça aguardando sua aprovação.</p>}
    </section>
  );
}
