import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("migration: acesso privado e agenda parcial preservando metadata", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.user',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table atendhub_clients(id uuid primary key,organization_id uuid,metadata jsonb,updated_at timestamptz,unique(id,organization_id));
 create table atendhub_team_members(id uuid,organization_id uuid,status text,role text);
 create function atendhub_has_client_access(uuid,uuid) returns boolean language sql as $$ select true $$;
 insert into auth.users values('00000000-0000-4000-8000-000000000001');
 insert into atendhub_team_members values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','active','super_admin');
 insert into atendhub_clients values('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','{"knowledge":[{"id":"preservar"}]}',now());
 select set_config('app.user','00000000-0000-4000-8000-000000000001',false);`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261118050000_atendhub_client_accesses_scheduling.sql",
        "utf8",
      ),
    );
    await db.exec(
      "select atendhub_update_external_scheduling('00000000-0000-4000-8000-000000000100','Minha agenda','https://agenda.example')",
    );
    const result = await db.query<{
      metadata: { knowledge: unknown[]; externalSchedulingName: string };
    }>("select metadata from atendhub_clients");
    expect(result.rows[0].metadata.knowledge).toEqual([{ id: "preservar" }]);
    expect(result.rows[0].metadata.externalSchedulingName).toBe("Minha agenda");
    await db.exec("set role authenticated");
    await expect(
      db.query("select * from atendhub_client_accesses"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role;set role anon");
    await expect(
      db.query("select * from atendhub_client_accesses"),
    ).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
}, 30000);
