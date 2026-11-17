import type { sessionOrganizationContext } from "./organization-session";
type Auth = Exclude<
  Awaited<ReturnType<typeof sessionOrganizationContext>>,
  { error: unknown }
>;
/** Resolve only names allowed by session RLS, never auth.users or service-role directory. */
export async function ownerLabels(auth: Auth, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await auth.supabase
    .from("atendhub_team_members")
    .select("id,display_name")
    .eq("organization_id", auth.organizationId)
    .in("id", unique);
  return new Map<string, string>(
    error
      ? []
      : (data ?? []).map((row) => [row.id, String(row.display_name).trim()]),
  );
}
