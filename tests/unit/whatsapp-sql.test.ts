import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("migration: comando atômico, idempotência, isolamento e callbacks sem regressão", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
 create table auth.users(id uuid primary key);
 create table atendhub_organizations(id uuid primary key);
 create table atendhub_team_members(id uuid primary key,organization_id uuid,role text,status text);
 create table atendhub_clients(id uuid primary key,organization_id uuid,name text,operation_id uuid,unique(id,organization_id));
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
 insert into atendhub_organizations values('00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000020');
 insert into atendhub_team_members values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','super_admin','active'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','super_admin','active');
 insert into atendhub_clients values('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','Dra. Ana Luíza',null);
 select set_config('app.user_id','00000000-0000-4000-8000-000000000001',false);`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261117000000_atendhub_whatsapp_connections.sql",
        "utf8",
      ),
    );
    const create = () =>
      db.query<{ result: { eventId: string; connectionId: string } }>(
        `select atendhub_whatsapp_command('create','00000000-0000-4000-8000-000000001000',null,'00000000-0000-4000-8000-000000000100','recepcao','551633334444') as result`,
      );
    const command = (await create()).rows[0].result;
    expect((await create()).rows[0].result).toEqual(command);
    const connection = await db.query<{
      instance_name: string;
      status: string;
    }>("select instance_name,status from atendhub_whatsapp_connections");
    expect(connection.rows).toEqual([
      {
        instance_name: "dra-ana-luiza-recepcao",
        status: "awaiting_confirmation",
      },
    ]);
    expect(
      (await db.query("select * from atendhub_whatsapp_events")).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select atendhub_whatsapp_callback($1,$2,'connected')", [
        command.connectionId,
        command.eventId,
      ]),
    ).rejects.toThrow("CONFIRM_REQUIRED");
    await expect(
      db.query("select atendhub_whatsapp_command('confirm',$1,$2)", [
        crypto.randomUUID(),
        command.connectionId,
      ]),
    ).rejects.toThrow("EVENT_NOT_DELIVERED");
    await db.query(
      "update atendhub_whatsapp_events set delivery_status='delivered' where id=$1",
      [command.eventId],
    );
    const confirmation = (
      await db.query<{ result: { eventId: string } }>(
        "select atendhub_whatsapp_command('confirm',$1,$2) as result",
        [crypto.randomUUID(), command.connectionId],
      )
    ).rows[0].result;
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select atendhub_whatsapp_callback($1,$2,'connected') as ok",
          [command.connectionId, confirmation.eventId],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select atendhub_whatsapp_callback($1,$2,'disconnected') as ok",
          [command.connectionId, confirmation.eventId],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select atendhub_whatsapp_callback($1,$2,'awaiting_confirmation') as ok",
          [command.connectionId, command.eventId],
        )
      ).rows[0].ok,
    ).toBe(false);
    await db.exec(
      "select set_config('app.user_id','00000000-0000-4000-8000-000000000002',false)",
    );
    await expect(
      db.query("select atendhub_whatsapp_command('confirm',$1,$2)", [
        crypto.randomUUID(),
        command.connectionId,
      ]),
    ).rejects.toThrow("CONNECTION_NOT_FOUND");
    await db.exec(
      "grant usage on schema auth to authenticated; grant select on atendhub_team_members to authenticated; set role authenticated",
    );
    expect(
      (await db.query("select * from atendhub_whatsapp_connections")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select atendhub_whatsapp_callback($1,$2,'connected')", [
        command.connectionId,
        confirmation.eventId,
      ]),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
    await db.exec("select set_config('app.user_id','',false)");
    await expect(create()).rejects.toThrow("WHATSAPP_FORBIDDEN");
  } finally {
    await db.close();
  }
}, 30000);
