import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, {
  ssl: 'require',
  max: 1,
  connection: { default_transaction_read_only: 'on' },
})

const mode = process.argv[2]
try {
  if (mode === 'tables') {
    const rows = await sql`
      select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'atendhub\_%'
      order by 1`
    console.log(JSON.stringify(rows))
  } else if (mode === 'columns') {
    const rows = await sql`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name like 'atendhub\_%'
      order by table_name, ordinal_position`
    const by = {}
    for (const r of rows) (by[r.table_name] ??= []).push(`${r.column_name} ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}${r.column_default ? ' = ' + r.column_default : ''}`)
    for (const [t, cols] of Object.entries(by)) console.log(`\n## ${t}\n  ` + cols.join('\n  '))
  } else if (mode === 'constraints') {
    const rows = await sql`
      select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
      from pg_constraint
      where connamespace = 'public'::regnamespace and conrelid::regclass::text like 'atendhub\_%'
      order by 1, 2`
    for (const r of rows) console.log(`${r.tbl} :: ${r.conname} :: ${r.def}`)
    const idx = await sql`select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename like 'atendhub\_%' order by 1,2`
    console.log('\n--- indexes')
    for (const r of idx) console.log(`${r.tablename} :: ${r.indexdef}`)
  } else if (mode === 'policies') {
    const rows = await sql`
      select tablename, policyname, cmd, roles, qual, with_check
      from pg_policies where schemaname='public' and tablename like 'atendhub\_%' order by 1,2`
    for (const r of rows) console.log(`${r.tablename} :: ${r.policyname} :: ${r.cmd} :: ${r.roles} :: USING ${r.qual} :: CHECK ${r.with_check}`)
  } else if (mode === 'functions') {
    const rows = await sql`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig,
             pg_get_function_result(p.oid) as ret
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'atendhub\_%' order by 1`
    for (const r of rows) console.log(`${r.proname}(${r.args}) -> ${r.ret} secdef=${r.prosecdef} cfg=${r.proconfig}`)
  } else if (mode === 'fn') {
    const rows = await sql`select pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = ${process.argv[3]}`
    for (const r of rows) console.log(r.def + '\n')
  } else if (mode === 'triggers') {
    const rows = await sql`
      select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
      from information_schema.triggers where trigger_schema='public' and event_object_table like 'atendhub\_%' order by 1,2`
    for (const r of rows) console.log(`${r.event_object_table} :: ${r.trigger_name} :: ${r.action_timing} ${r.event_manipulation} :: ${r.action_statement}`)
  } else if (mode === 'migrations') {
    const rows = await sql`select version, name from supabase_migrations.schema_migrations order by version`
    for (const r of rows) console.log(`${r.version} ${r.name}`)
  } else if (mode === 'counts') {
    const t = await sql`select count(*)::int c from atendhub_leads`
    const cl = await sql`select count(*)::int c from atendhub_clients`
    const cn = await sql`select count(*)::int c from atendhub_whatsapp_connections`
    console.log(JSON.stringify({ leads: t[0].c, clients: cl[0].c, connections: cn[0].c }))
  } else if (mode === 'grants') {
    const rows = await sql`
      select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
      from information_schema.role_table_grants
      where table_schema='public' and table_name like 'atendhub\_%' and grantee in ('anon','authenticated','service_role')
      group by 1,2 order by 1,2`
    for (const r of rows) console.log(`${r.table_name} :: ${r.grantee} :: ${r.privs}`)
  } else if (mode === 'pub') {
    const rows = await sql`select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' order by 1,2`
    console.log(JSON.stringify(rows))
  } else if (mode === 'roles') {
    const rows = await sql`select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname !~ '^pg_' order by 1`
    console.log(JSON.stringify(rows))
  }
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await sql.end()
}
