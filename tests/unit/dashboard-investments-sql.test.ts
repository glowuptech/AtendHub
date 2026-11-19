import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("migration de investimentos: RLS, upsert, zero explícito, exclusão e recusa de escrita/escopo indevidos", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001",
    attendant = "00000000-0000-4000-8000-000000000002",
    org = "00000000-0000-4000-8000-000000000010",
    otherOrg = "00000000-0000-4000-8000-000000000020",
    client = "00000000-0000-4000-8000-000000000100",
    otherClient = "00000000-0000-4000-8000-000000000200";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.user',true),'')::uuid$$;
   create table auth.users(id uuid primary key);
   create table atendhub_clients(id uuid primary key,organization_id uuid,unique(id,organization_id));
   create table atendhub_team_members(id uuid,organization_id uuid,status text,role text);
   create function atendhub_is_active_member(_org uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.atendhub_team_members m where m.id=auth.uid() and m.organization_id=_org and m.status='active') $$;
   create function atendhub_has_client_access(_org uuid,_client uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.atendhub_clients c join public.atendhub_team_members m on m.organization_id=c.organization_id where c.id=_client and c.organization_id=_org and m.id=auth.uid() and m.status='active') $$;
   insert into auth.users values('${admin}'),('${attendant}');
   insert into atendhub_team_members values('${admin}','${org}','active','super_admin'),('${attendant}','${org}','active','attendant');
   insert into atendhub_clients values('${client}','${org}'),('${otherClient}','${otherOrg}');`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261119000000_atendhub_dashboard_investments.sql",
        "utf8",
      ),
    );
    await db.exec(
      `select set_config('app.user','${admin}',false); set role authenticated;`,
    );
    await db.query(
      `select atendhub_save_daily_investment($1,$2,'2026-11-03',10000,'Meta')`,
      [org, client],
    );
    await db.query(
      `select atendhub_save_daily_investment($1,$2,'2026-11-03',0,'sem anúncios')`,
      [org, client],
    );
    expect(
      (
        await db.query<{ amount_cents: number }>(
          "select amount_cents from atendhub_daily_investments",
        )
      ).rows.map((r) => Number(r.amount_cents)),
    ).toEqual([0]);
    await expect(
      db.query(
        `select atendhub_save_daily_investment($1,$2,'2026-11-03',1,'')`,
        [otherOrg, otherClient],
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      db.query(
        `select atendhub_save_daily_investment($1,$2,'2026-11-04',-1,'')`,
        [org, client],
      ),
    ).rejects.toThrow();
    await db.exec(
      `reset role; select set_config('app.user','${attendant}',false); set role authenticated;`,
    );
    expect(
      (await db.query("select * from atendhub_daily_investments")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(`select atendhub_remove_daily_investment($1,$2,'2026-11-03')`, [
        org,
        client,
      ]),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      db.query("delete from atendhub_daily_investments"),
    ).rejects.toThrow("permission denied");
    await db.exec(
      `reset role; select set_config('app.user','',false); set role authenticated;`,
    );
    expect(
      (await db.query("select * from atendhub_daily_investments")).rows,
    ).toHaveLength(0);
    await db.exec("reset role; set role anon");
    await expect(
      db.query("select * from atendhub_daily_investments"),
    ).rejects.toThrow("permission denied");
    await db.exec(
      `reset role; select set_config('app.user','${admin}',false); set role authenticated;`,
    );
    await db.query(
      `select atendhub_remove_daily_investment($1,$2,'2026-11-03')`,
      [org, client],
    );
    expect(
      (await db.query("select * from atendhub_daily_investments")).rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);
