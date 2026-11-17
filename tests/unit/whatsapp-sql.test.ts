import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("comandos, resposta síncrona, idempotência, isolamento e persistência", async () => {
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
    await db.exec(
      await readFile(
        "supabase/migrations/20261117065145_atendhub_whatsapp_sync_response.sql",
        "utf8",
      ),
    );

    const request = (index: number) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const command = async (
      action: string,
      requestIndex: number,
      connectionId: string | null = null,
      phone: string | null = null,
    ) =>
      db.query<{ result: { eventId: string; connectionId: string } }>(
        `select public.atendhub_whatsapp_command($1,$2,$3,null,null,$4) as result`,
        [action, request(requestIndex), connectionId, phone],
      );
    const apply = async (
      eventId: string,
      status: string | null,
      deliveryStatus = "delivered",
    ) =>
      db.query<{
        result: {
          received: boolean;
          applied: boolean;
          stale: boolean;
          status: string | null;
        };
      }>(
        `select public.atendhub_whatsapp_apply_response($1,$2,$3) as result`,
        [eventId, deliveryStatus, status],
      );

    const createRequest = request(1000);
    const created = await db.query<{
      result: { eventId: string; connectionId: string };
    }>(
      `select public.atendhub_whatsapp_command('create',$1,null,'00000000-0000-4000-8000-000000000100','recepcao','551633334444') as result`,
      [createRequest],
    );
    const createdEvent = created.rows[0].result.eventId;
    const connectionId = created.rows[0].result.connectionId;
    const repeatedCreate = await db.query<{
      result: { eventId: string; connectionId: string };
    }>(
      `select public.atendhub_whatsapp_command('create',$1,null,'00000000-0000-4000-8000-000000000100','recepcao','551633334444') as result`,
      [createRequest],
    );
    expect(repeatedCreate.rows[0].result).toEqual(created.rows[0].result);
    expect(
      (
        await db.query<{ instance_name: string; status: string }>(
          "select instance_name,status from public.atendhub_whatsapp_connections",
        )
      ).rows,
    ).toEqual([
      {
        instance_name: "dra-ana-luiza-recepcao",
        status: "awaiting_confirmation",
      },
    ]);

    const genericReceipt = (await apply(createdEvent, null)).rows[0].result;
    expect(genericReceipt).toMatchObject({
      received: true,
      applied: false,
      stale: false,
      status: null,
    });
    const genericState = await db.query<{
      status: string;
      delivery_status: string;
      result_status: string | null;
    }>(`select c.status,e.delivery_status,e.result_status
      from public.atendhub_whatsapp_connections c
      join public.atendhub_whatsapp_events e on e.id=c.last_event_id`);
    expect(genericState.rows[0]).toEqual({
      status: "awaiting_confirmation",
      delivery_status: "delivered",
      result_status: null,
    });

    const confirmation = (
      await command("confirm", 1001, connectionId)
    ).rows[0].result;
    expect(
      (
        await apply(confirmation.eventId, "connected")
      ).rows[0].result,
    ).toMatchObject({ received: true, applied: true, status: "connected" });
    const persistedAfterReload = await db.query<{ status: string }>(
      "select status from public.atendhub_whatsapp_connections where id=$1",
      [connectionId],
    );
    expect(persistedAfterReload.rows[0].status).toBe("connected");

    const update = (await command("update", 1002, connectionId, "551633335555"))
      .rows[0].result;
    await apply(update.eventId, "disconnected");
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.atendhub_whatsapp_connections where id=$1",
          [connectionId],
        )
      ).rows[0].status,
    ).toBe("disconnected");

    const pendingUpdate = (
      await command("update", 1003, connectionId, "551633336666")
    ).rows[0].result;
    await apply(pendingUpdate.eventId, "awaiting_confirmation");
    const pendingConfirmation = (
      await command("confirm", 1004, connectionId)
    ).rows[0].result;
    await apply(pendingConfirmation.eventId, null);
    const deletion = (await command("delete", 1005, connectionId)).rows[0]
      .result;
    expect(
      (
        await apply(pendingConfirmation.eventId, "connected")
      ).rows[0].result,
    ).toMatchObject({ received: true, applied: false, stale: true });
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.atendhub_whatsapp_connections where id=$1",
          [connectionId],
        )
      ).rows[0].status,
    ).toBe("delete_pending");
    expect(
      (
        await apply(deletion.eventId, "deleted")
      ).rows[0].result,
    ).toMatchObject({ applied: true, status: "deleted" });

    await expect(apply(deletion.eventId, "connected")).rejects.toThrow(
      "INVALID_TRANSITION",
    );
    await expect(
      db.query(
        `select public.atendhub_whatsapp_command('confirm',$1,$2)`,
        [request(1006), connectionId],
      ),
    ).rejects.toThrow("CONNECTION_NOT_FOUND");

    await db.exec(
      "select set_config('app.user_id','',false); grant usage on schema auth to authenticated; grant select on public.atendhub_team_members to authenticated; set role authenticated",
    );
    expect(
      (
        await db.query("select * from public.atendhub_whatsapp_connections")
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `select public.atendhub_whatsapp_apply_response($1,'delivered','connected')`,
        [deletion.eventId],
      ),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role; select set_config('app.user_id','',false)");
    await expect(
      db.query(
        `select public.atendhub_whatsapp_command('confirm',$1,$2)`,
        [request(1007), connectionId],
      ),
    ).rejects.toThrow("WHATSAPP_FORBIDDEN");
  } finally {
    await db.close();
  }
}, 30000);
