import postgres from "postgres";
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: "require", max: 1, prepare: false, connection: { default_transaction_read_only: "on" } });
const q = async (t, s) => { console.log("== " + t); console.log(JSON.stringify(await sql.unsafe(s))); };
await q("perm cols", "select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('atendhub_team_member_permissions','atendhub_team_members','atendhub_whatsapp_connections') order by table_name, ordinal_position");
await q("fns", "select proname, pg_get_function_arguments(oid) args, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('atendhub_is_active_member','atendhub_has_client_access','atendhub_claim_lead','atendhub_is_super_admin')");
await q("conn constraints", "select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.atendhub_whatsapp_connections'::regclass");
await q("role exists", "select rolname from pg_roles where rolname like 'atendhub%'");
await sql.end();
