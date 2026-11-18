import "server-only";
import type { InboxAuth } from "@/features/inbox/server";

type KnowledgeAction = "view" | "edit";

export async function canAccessKnowledge(
  auth: InboxAuth,
  action: KnowledgeAction,
) {
  const { data, error } = await auth.supabase
    .from("atendhub_team_member_permissions")
    .select("grant_level")
    .eq("organization_id", auth.organizationId)
    .eq("team_member_id", auth.userId)
    .eq("permission_key", `knowledge.${action}`)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.grant_level === "all";
  if (action === "view") return true;
  return auth.role === "manager" || auth.role === "super_admin";
}
