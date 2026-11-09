import postgres from "postgres";

const [, , email, organizationId] = process.argv;
if (!email || !organizationId) {
  throw new Error("Uso: npm run atendhub:provision-admin -- email@dominio.com organization-uuid");
}

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL, {
  max: 1,
  ssl: "require",
});

try {
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`;
    const organizations = await transaction`
      select id
      from public.atendhub_organizations
      where id = ${organizationId}
      limit 1
    `;
    if (!organizations[0]) throw new Error("Organização não encontrada.");

    const existingAdmins = await transaction`
      select count(*)::int as count
      from public.atendhub_team_members
      where organization_id = ${organizationId}
        and role = 'super_admin'
        and status = 'active'
    `;
    if (existingAdmins[0]?.count > 0) throw new Error("A organização já possui um superadministrador ativo.");

    const users = await transaction`
      select id, email
      from auth.users
      where lower(email) = lower(${email})
      limit 1
    `;
    if (!users[0]) throw new Error("Usuário não encontrado. Crie a conta pelo fluxo normal do Supabase Auth primeiro.");

    await transaction`
      insert into public.atendhub_team_members
        (id, organization_id, display_name, role, status, client_access_mode)
      values
        (${users[0].id}, ${organizationId}, ${users[0].email ?? email}, 'super_admin', 'active', 'all')
      on conflict (id, organization_id) do update set
        role = 'super_admin',
        status = 'active',
        client_access_mode = 'all',
        updated_at = now()
    `;
  });
  console.log(`Superadministrador provisionado para ${email}.`);
} finally {
  await sql.end({ timeout: 5 });
}
