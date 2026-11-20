import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(10);
const OTHER_ORG = id(20);
const OP = id(30);
const CLIENT_A = id(100);
const CLIENT_B = id(101);
const USER_OWNER = id(1);
const USER_OTHER = id(2);
const USER_NO_CLIENT = id(3);
const USER_SUPERVISOR = id(4);
const CONN_A = id(200);
const CONN_B = id(201);
const CONN_A2 = id(202);

let db: PGlite;

const as = async (userId: string | null, role = "authenticated") => {
  await db.exec(`reset role; select set_config('app.user_id','${userId ?? ""}',false);`);
  if (role !== "postgres") await db.exec(`set role ${role}`);
};
const admin = () => as(null, "postgres");

type Json = Record<string, unknown>;
const ingest = async (over: Json = {}) => {
  const a = {
    instance: "inst-a", pmid: "MSG1", jid: "5511999990001@s.whatsapp.net", fromMe: false,
    type: "text", body: "Olá", ts: "2026-11-17T10:00:00Z", corr: null, phone: null,
    name: null, media: {}, meta: {}, lead: null, ...over,
  };
  await admin();
  const r = await db.query<{ r: Json }>(
    `select public.atendhub_ingest_whatsapp_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13) as r`,
    [a.instance, a.pmid, a.jid, a.fromMe, a.type, a.body, a.ts, a.corr, a.phone, a.name,
      JSON.stringify(a.media), JSON.stringify(a.meta), a.lead],
  );
  return r.rows[0].r;
};
const count = async (sql: string) =>
  Number((await db.query<{ n: string }>(`select count(*)::int as n from ${sql}`)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table atendhub_organizations(id uuid primary key);
    create table atendhub_operations(id uuid primary key, organization_id uuid, code text, name text);
    create table atendhub_clients(id uuid primary key, organization_id uuid, name text, operation_id uuid, unique(id, organization_id));
    create table atendhub_team_members(id uuid primary key, organization_id uuid, role text, status text, display_name text default 'Atendente', client_access_mode text default 'all');
    create table atendhub_team_member_clients(team_member_id uuid, client_id uuid);
    create table atendhub_team_member_permissions(team_member_id uuid, organization_id uuid, permission_key text, grant_level text);
    create table atendhub_leads(
      id uuid primary key default gen_random_uuid(), organization_id uuid not null, client_id uuid not null,
      name text not null, phone text not null default '', source text not null default 'manual',
      capture_status text not null default 'in_progress', stage text not null default 'new',
      owner_id uuid references auth.users(id), notes text not null default '', first_response_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id, id));
    create table atendhub_lead_events(
      id uuid primary key default gen_random_uuid(), organization_id uuid not null, lead_id uuid not null,
      actor_id uuid not null references auth.users(id), event_type text not null, from_stage text, to_stage text,
      metadata jsonb not null default '{}', created_at timestamptz not null default now());
    create function public.atendhub_is_active_member(target_org uuid) returns boolean language sql stable security definer as
      $$ select exists(select 1 from public.atendhub_team_members m where m.id = auth.uid() and m.organization_id = target_org and m.status = 'active') $$;
    create function public.atendhub_has_client_access(target_org uuid, target_client uuid) returns boolean language sql stable security definer as
      $$ select exists(select 1 from public.atendhub_team_members m where m.id = auth.uid() and m.organization_id = target_org and m.status = 'active'
          and (m.client_access_mode = 'all' or exists(select 1 from public.atendhub_team_member_clients c where c.team_member_id = m.id and c.client_id = target_client))) $$;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated, service_role;

    insert into auth.users values ('${USER_OWNER}'),('${USER_OTHER}'),('${USER_NO_CLIENT}'),('${USER_SUPERVISOR}');
    insert into atendhub_organizations values ('${ORG}'),('${OTHER_ORG}');
    insert into atendhub_operations values ('${OP}','${ORG}','OP1','Operação 1');
    insert into atendhub_clients values ('${CLIENT_A}','${ORG}','Cliente A','${OP}'),('${CLIENT_B}','${ORG}','Cliente B','${OP}');
    insert into atendhub_team_members(id, organization_id, role, status, client_access_mode) values
      ('${USER_OWNER}','${ORG}','attendant','active','all'),
      ('${USER_OTHER}','${ORG}','attendant','active','all'),
      ('${USER_NO_CLIENT}','${ORG}','attendant','active','selected'),
      ('${USER_SUPERVISOR}','${ORG}','manager','active','all');
    insert into atendhub_team_member_permissions values ('${USER_SUPERVISOR}','${ORG}','inbox.supervise','all');
  `);
  for (const f of [
    "20261117000000_atendhub_whatsapp_connections",
    "20261117065145_atendhub_whatsapp_sync_response",
    "20261117080000_atendhub_whatsapp_private_credentials",
    "20261118000000_atendhub_inbox",
    "20261118010000_atendhub_start_inbox_conversation",
    "20261120000000_atendhub_inbox_episodes",
  ])
    await db.exec(await readFile(`supabase/migrations/${f}.sql`, "utf8"));
  await db.exec(`
    insert into atendhub_whatsapp_connections(id, organization_id, client_id, name, instance_name, phone, status, created_by_id) values
      ('${CONN_A}','${ORG}','${CLIENT_A}','Linha A','inst-a','5511900000001','connected','${USER_OWNER}'),
      ('${CONN_B}','${ORG}','${CLIENT_B}','Linha B','inst-b','5511900000002','connected','${USER_OWNER}'),
      ('${CONN_A2}','${ORG}','${CLIENT_A}','Linha A2','inst-a2','5511900000003','awaiting_confirmation','${USER_OWNER}');
  `);
});

describe("ingestão", () => {
  it("cria lead sem responsável, conversa e mensagem somente no cliente da instância", async () => {
    const r = await ingest({ name: "Maria" });
    expect(r).toMatchObject({ ok: true, outcome: "recorded", leadCreated: true, clientId: CLIENT_A });
    const lead = await db.query<Json>(
      `select client_id, owner_id, stage, source, name, phone, capture_status, professional_id is null as no_prof from (select *, null::uuid as professional_id from atendhub_leads) t where id = $1`,
      [r.leadId],
    );
    expect(lead.rows[0]).toMatchObject({ client_id: CLIENT_A, owner_id: null, stage: "new", source: "whatsapp", name: "Maria", phone: "5511999990001" });
    const ev = await db.query<Json>(`select actor_id, event_type, metadata from atendhub_lead_events where lead_id = $1`, [r.leadId]);
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0]).toMatchObject({ actor_id: null, event_type: "created" });
  });

  it("reentrega não duplica mensagem, lead nem não lidas", async () => {
    const before = await count("atendhub_inbox_messages");
    const r = await ingest();
    expect(r).toMatchObject({ ok: true, outcome: "duplicate" });
    expect(await count("atendhub_inbox_messages")).toBe(before);
    const conv = await db.query<Json>(`select unread_count from atendhub_inbox_conversations where id = $1`, [r.conversationId]);
    expect(conv.rows[0].unread_count).toBe(1);
  });

  it("mesmo telefone em outro cliente permanece separado", async () => {
    const r = await ingest({ instance: "inst-b", pmid: "B1" });
    expect(r).toMatchObject({ outcome: "recorded", leadCreated: true, clientId: CLIENT_B });
    expect(await count("atendhub_leads where phone = '5511999990001'")).toBe(2);
  });

  it("reutiliza lead existente, inclusive com máscara e sem DDI, sem inserir nono dígito", async () => {
    await admin();
    await db.exec(`insert into atendhub_leads(id, organization_id, client_id, name, phone) values ('${id(500)}','${ORG}','${CLIENT_A}','Existente','(11) 98888-0002')`);
    const r = await ingest({ pmid: "E1", jid: "5511988880002@s.whatsapp.net" });
    expect(r).toMatchObject({ outcome: "recorded", leadCreated: false, leadId: id(500) });
    const none = await ingest({ pmid: "E2", jid: "551188880002@s.whatsapp.net" });
    expect(none).toMatchObject({ leadCreated: true });
    expect(none.leadId).not.toBe(id(500));
  });

  it("quarentena telefones com vários leads e só resolve para um candidato", async () => {
    await admin();
    await db.exec(`insert into atendhub_leads(id, organization_id, client_id, name, phone) values
      ('${id(501)}','${ORG}','${CLIENT_A}','Dup 1','5511977770003'),('${id(502)}','${ORG}','${CLIENT_A}','Dup 2','(11) 97777-0003')`);
    const jid = "5511977770003@s.whatsapp.net";
    const r = await ingest({ pmid: "AMB1", jid });
    expect(r).toMatchObject({ ok: false, outcome: "ambiguous_lead" });
    expect(await count("atendhub_inbox_messages where provider_message_id = 'AMB1'")).toBe(0);
    await expect(ingest({ pmid: "AMB1", jid, lead: id(500) })).rejects.toThrow(/LEAD_OVERRIDE_NOT_ALLOWED/);
    const ok = await ingest({ pmid: "AMB1", jid, lead: id(502) });
    expect(ok).toMatchObject({ outcome: "recorded", leadId: id(502) });
    expect(await count("atendhub_inbox_unresolved where resolved_at is null")).toBe(0);
  });

  it("ignora grupos, status e o próprio número; @lid sem telefone fica pendente", async () => {
    expect(await ingest({ pmid: "G1", jid: "120363000000000000@g.us" })).toMatchObject({ outcome: "ignored_group" });
    expect(await ingest({ pmid: "G2", jid: "status@broadcast" })).toMatchObject({ outcome: "ignored_broadcast" });
    expect(await ingest({ pmid: "G3", jid: "5511900000001@s.whatsapp.net" })).toMatchObject({ outcome: "ignored_self" });
    expect(await ingest({ pmid: "G4", jid: "abc@s.whatsapp.net" })).toMatchObject({ outcome: "invalid_jid" });
    expect(await ingest({ pmid: "L1", jid: "123456789012@lid" })).toMatchObject({ ok: false, outcome: "pending_identity" });
    expect(await count("atendhub_leads where phone = '123456789012'")).toBe(0);
    const resolved = await ingest({ pmid: "L1", jid: "123456789012@lid", phone: "+55 11 96666-0004" });
    expect(resolved).toMatchObject({ outcome: "recorded", leadCreated: true });
    expect(await ingest({ instance: "inexistente", pmid: "X" })).toMatchObject({ ok: false, outcome: "instance_not_found" });
  });

  it("mensagem do celular (fromMe) usa o destinatário, não atribui responsável e não cria envio", async () => {
    const events = await count("atendhub_inbox_send_events");
    const r = await ingest({ pmid: "FM1", jid: "5511999990001@s.whatsapp.net", fromMe: true, body: "Respondi pelo celular" });
    expect(r).toMatchObject({ outcome: "recorded", leadCreated: false });
    const m = await db.query<Json>(`select direction, origin, status, author_id from atendhub_inbox_messages where id = $1`, [r.messageId]);
    expect(m.rows[0]).toMatchObject({ direction: "outbound", origin: "external_device", status: "sent", author_id: null });
    const lead = await db.query<Json>(`select owner_id from atendhub_leads where id = $1`, [r.leadId]);
    expect(lead.rows[0].owner_id).toBeNull();
    expect(await count("atendhub_inbox_send_events")).toBe(events);
  });

  it("mídia guarda só metadados mínimos, sem URL ou credenciais", async () => {
    const r = await ingest({
      pmid: "MD1", type: "image", body: "",
      media: { mimetype: "image/jpeg", url: "https://x/?token=abc", caption: "foto", apikey: "SEGREDO" },
      meta: { keyId: "K1", apikey: "SEGREDO" },
    });
    const m = await db.query<Json>(`select message_type, body, media, provider_meta from atendhub_inbox_messages where id = $1`, [r.messageId]);
    expect(m.rows[0]).toMatchObject({ message_type: "image", body: "foto", media: { mimetype: "image/jpeg", caption: "foto" } });
    expect(JSON.stringify(m.rows[0])).not.toMatch(/SEGREDO|token/);
  });
});

describe("envio pelo Inbox, reconciliação e RLS", () => {
  let leadId: string;
  let conversationId: string;
  const REQ1 = id(900);

  beforeAll(async () => {
    const r = await ingest({ pmid: "S0", jid: "5511955550010@s.whatsapp.net", body: "Quero agendar" });
    leadId = r.leadId as string;
    conversationId = r.conversationId as string;
  });

  it("lead sem responsável não é visível nem permite envio", async () => {
    await as(USER_OWNER);
    expect(await count("atendhub_inbox_conversations")).toBe(0);
    await expect(db.query(`select public.atendhub_inbox_request_send($1,$2,'oi')`, [conversationId, REQ1])).rejects.toThrow(/INBOX_SEND_FORBIDDEN/);
  });

  it("assumir o lead torna a conversa acessível apenas ao responsável", async () => {
    await admin();
    await db.query(`update atendhub_leads set owner_id = $1 where id = $2`, [USER_OWNER, leadId]);
    await as(USER_OWNER);
    expect(await count(`atendhub_inbox_conversations where id = '${conversationId}'`)).toBe(1);
    expect(await count(`atendhub_inbox_messages where conversation_id = '${conversationId}'`)).toBe(1);
    await as(USER_OTHER);
    expect(await count("atendhub_inbox_conversations")).toBe(0);
    await as(USER_NO_CLIENT);
    expect(await count("atendhub_inbox_conversations")).toBe(0);
    await as(null, "anon");
    await expect(db.query(`select * from atendhub_inbox_conversations`)).rejects.toThrow();
    await as(USER_SUPERVISOR);
    expect(await count(`atendhub_inbox_conversations where id = '${conversationId}'`)).toBe(1);
    await expect(db.query(`select public.atendhub_inbox_request_send($1,$2,'oi')`, [conversationId, REQ1])).rejects.toThrow(/INBOX_SEND_FORBIDDEN/);
  });

  it("trocar o responsável move o acesso", async () => {
    await admin();
    await db.query(`update atendhub_leads set owner_id = $1 where id = $2`, [USER_OTHER, leadId]);
    await as(USER_OWNER);
    expect(await count(`atendhub_inbox_conversations where id = '${conversationId}'`)).toBe(0);
    await as(USER_OTHER);
    expect(await count(`atendhub_inbox_conversations where id = '${conversationId}'`)).toBe(1);
    await admin();
    await db.query(`update atendhub_leads set owner_id = $1 where id = $2`, [USER_OWNER, leadId]);
  });

  it("navegador não escreve nas tabelas do Inbox", async () => {
    await as(USER_OWNER);
    await expect(db.query(`update atendhub_inbox_messages set body = 'x'`)).rejects.toThrow();
    await expect(db.query(`select * from atendhub_inbox_send_events`)).rejects.toThrow();
    await expect(db.query(`select public.atendhub_ingest_whatsapp_message('inst-a','Z','5511@s.whatsapp.net',false)`)).rejects.toThrow();
  });

  let messageId: string;
  let eventId: string;
  it("persiste mensagem pendente e evento sem API key, de forma idempotente", async () => {
    await as(USER_OWNER);
    const r = await db.query<{ r: Json }>(`select public.atendhub_inbox_request_send($1,$2,'  Olá, tudo bem?  ') as r`, [conversationId, REQ1]);
    messageId = r.rows[0].r.messageId as string;
    eventId = r.rows[0].r.eventId as string;
    expect(r.rows[0].r).toMatchObject({ status: "pending", existing: false });
    const again = await db.query<{ r: Json }>(`select public.atendhub_inbox_request_send($1,$2,'Olá, tudo bem?') as r`, [conversationId, REQ1]);
    expect(again.rows[0].r).toMatchObject({ messageId, eventId, existing: true });
    await expect(db.query(`select public.atendhub_inbox_request_send($1,$2,'Outro texto')`, [conversationId, REQ1])).rejects.toThrow(/REQUEST_ID_CONFLICT/);
    await admin();
    const ev = await db.query<{ payload: Json }>(`select payload from atendhub_inbox_send_events where id = $1`, [eventId]);
    const payload = ev.rows[0].payload as Json & { connection: Json; message: Json; recipient: Json; user: Json };
    expect(JSON.stringify(payload)).not.toMatch(/apiKey|api_key/i);
    expect(payload).toMatchObject({ eventType: "inbox.message.send_requested", contractVersion: 1 });
    expect(payload.connection).toMatchObject({ instanceName: "inst-a" });
    expect(payload.message).toMatchObject({ id: messageId, body: "Olá, tudo bem?" });
    expect(payload.recipient).toMatchObject({ phone: "5511955550010" });
    expect(payload.user).toMatchObject({ id: USER_OWNER });
  });

  it("impede envio com conexão não conectada", async () => {
    await admin();
    await db.query(`update atendhub_whatsapp_connections set status = 'disconnected' where id = $1`, [CONN_A]);
    await as(USER_OWNER);
    await expect(db.query(`select public.atendhub_inbox_request_send($1,$2,'novo')`, [conversationId, id(901)])).rejects.toThrow(/CONNECTION_NOT_READY/);
    await admin();
    await db.query(`update atendhub_whatsapp_connections set status = 'connected' where id = $1`, [CONN_A]);
  });

  it("incerto não vira enviado sem ID do provedor; enviado exige messageId", async () => {
    await admin();
    await expect(db.query(`select public.atendhub_inbox_apply_send_result($1,'sent',null)`, [eventId])).rejects.toThrow(/PROVIDER_MESSAGE_ID_REQUIRED/);
    await db.query(`select public.atendhub_inbox_apply_send_result($1,'uncertain',null,'timeout')`, [eventId]);
    const m = await db.query<Json>(`select status, failure_reason, provider_message_id from atendhub_inbox_messages where id = $1`, [messageId]);
    expect(m.rows[0]).toMatchObject({ status: "uncertain", failure_reason: "timeout", provider_message_id: null });
  });

  it("eco da Evolution antes do resultado é fundido sem duplicar", async () => {
    const echo = await ingest({ pmid: "ECHO1", jid: "5511955550010@s.whatsapp.net", fromMe: true, body: "Olá, tudo bem?" });
    expect(echo.outcome).toBe("recorded");
    expect(await count(`atendhub_inbox_messages where conversation_id = '${conversationId}' and body = 'Olá, tudo bem?'`)).toBe(2);
    await admin();
    await db.query(`select public.atendhub_inbox_apply_send_result($1,'sent','ECHO1')`, [eventId]);
    expect(await count(`atendhub_inbox_messages where conversation_id = '${conversationId}' and body = 'Olá, tudo bem?'`)).toBe(1);
    const m = await db.query<Json>(`select id, status, provider_message_id, origin from atendhub_inbox_messages where provider_message_id = 'ECHO1'`);
    expect(m.rows).toEqual([{ id: messageId, status: "sent", provider_message_id: "ECHO1", origin: "inbox" }]);
    const lead = await db.query<Json>(`select first_response_at is not null as responded from atendhub_leads where id = $1`, [leadId]);
    expect(lead.rows[0].responded).toBe(true);
    expect(await ingest({ pmid: "ECHO1", jid: "5511955550010@s.whatsapp.net", fromMe: true })).toMatchObject({ outcome: "duplicate", messageId });
  });

  it("recibos fora de ordem nunca regridem o estado", async () => {
    const status = async (s: string) => {
      await admin();
      return (await db.query<{ r: Json }>(`select public.atendhub_inbox_record_message_status('inst-a','ECHO1',$1) as r`, [s])).rows[0].r;
    };
    expect(await status("read")).toMatchObject({ status: "read" });
    expect(await status("delivered")).toMatchObject({ status: "read", outcome: "unchanged" });
    expect(await status("failed")).toMatchObject({ status: "read" });
    await admin();
    await db.query(`select public.atendhub_inbox_apply_send_result($1,'failed',null,'tarde demais')`, [eventId]);
    const m = await db.query<Json>(`select status from atendhub_inbox_messages where id = $1`, [messageId]);
    expect(m.rows[0].status).toBe("read");
  });

  it("recibo de mensagem ainda desconhecida é guardado e aplicado depois", async () => {
    await admin();
    const early = await db.query<{ r: Json }>(`select public.atendhub_inbox_record_message_status('inst-a','LATE1','delivered') as r`);
    expect(early.rows[0].r).toMatchObject({ outcome: "stored_for_later" });
    await ingest({ pmid: "LATE1", jid: "5511955550010@s.whatsapp.net", fromMe: true, body: "pelo celular" });
    const m = await db.query<Json>(`select status from atendhub_inbox_messages where provider_message_id = 'LATE1'`);
    expect(m.rows[0].status).toBe("delivered");
  });

  it("reconcilia pelo ID interno de correlação e permite retentativa após falha", async () => {
    await as(USER_OWNER);
    const sent = await db.query<{ r: Json }>(`select public.atendhub_inbox_request_send($1,$2,'Segunda mensagem') as r`, [conversationId, id(902)]);
    const m2 = sent.rows[0].r;
    await admin();
    await db.query(`select public.atendhub_inbox_apply_send_result($1,'failed',null,'n8n recusou')`, [m2.eventId]);
    const failed = await db.query<Json>(`select status, failure_reason from atendhub_inbox_messages where id = $1`, [m2.messageId]);
    expect(failed.rows[0]).toMatchObject({ status: "failed", failure_reason: "n8n recusou" });
    await as(USER_OWNER);
    const retry = await db.query<{ r: Json }>(`select public.atendhub_inbox_request_send($1,$2,'Segunda mensagem') as r`, [conversationId, id(902)]);
    expect(retry.rows[0].r).toMatchObject({ messageId: m2.messageId, eventId: m2.eventId, status: "pending", existing: true });
    const echo = await ingest({ pmid: "ECHO2", jid: "5511955550010@s.whatsapp.net", fromMe: true, body: "Segunda mensagem", corr: m2.messageId as string });
    expect(echo).toMatchObject({ outcome: "reconciled", messageId: m2.messageId });
    expect(await count(`atendhub_inbox_messages where body = 'Segunda mensagem'`)).toBe(1);
  });

  it("marcar como lida é restrito ao responsável", async () => {
    await as(USER_OTHER);
    await expect(db.query(`select public.atendhub_inbox_mark_read($1)`, [conversationId])).rejects.toThrow(/INBOX_READ_FORBIDDEN/);
    await as(USER_OWNER);
    await db.query(`select public.atendhub_inbox_mark_read($1)`, [conversationId]);
    const c = await db.query<Json>(`select unread_count, last_message_preview from atendhub_inbox_conversations where id = $1`, [conversationId]);
    expect(c.rows[0].unread_count).toBe(0);
  });

  it("constraints impedem misturar organização, cliente, lead e conexão", async () => {
    await admin();
    await expect(db.query(
      `insert into atendhub_inbox_conversations(organization_id, client_id, connection_id, lead_id, remote_jid, phone)
       select organization_id, $1, $2, id, '5511900000099@s.whatsapp.net', '5511900000099' from atendhub_leads where id = $3`,
      [CLIENT_B, CONN_A, leadId],
    )).rejects.toThrow();
    await expect(db.query(
      `insert into atendhub_inbox_messages(organization_id, client_id, connection_id, conversation_id, direction, origin, occurred_at, status)
       values ($1, $2, $3, $4, 'inbound', 'contact', now(), 'sent')`,
      [ORG, CLIENT_A, CONN_A, conversationId],
    )).rejects.toThrow();
  });
});


describe("conversa proativa sem mensagem recebida",()=>{
 const lead=id(5000);
 it("abre uma conversa vazia idempotente, sem mensagem, envio ou mudança do lead",async()=>{
  await admin();
  await db.query("insert into atendhub_leads(id,organization_id,client_id,name,phone,owner_id,stage) values($1,$2,$3,'Adriana','16999990000',$4,'in_progress')",[lead,ORG,CLIENT_A,USER_OWNER]);
  await as(USER_OWNER);
  const start=()=>db.query<{id:string}>("select atendhub_inbox_start_conversation($1,$2) as id",[lead,CONN_A]);
  const first=(await start()).rows[0].id;
  expect((await start()).rows[0].id).toBe(first);
  await admin();
  expect(await count(`atendhub_inbox_messages where conversation_id='${first}'`)).toBe(0);
  expect(await count(`atendhub_inbox_send_events where message_id in (select id from atendhub_inbox_messages where conversation_id='${first}')`)).toBe(0);
  expect((await db.query<Json>("select phone,last_message_at from atendhub_inbox_conversations where id=$1",[first])).rows[0]).toEqual({phone:"5516999990000",last_message_at:null});
 });
 it("recusa outro responsável e uma conexão de outro cliente",async()=>{
  await as(USER_OTHER);
  await expect(db.query("select atendhub_inbox_start_conversation($1,$2)",[lead,CONN_A])).rejects.toThrow("INBOX_START_FORBIDDEN");
  await as(USER_OWNER);
  await expect(db.query("select atendhub_inbox_start_conversation($1,$2)",[lead,CONN_B])).rejects.toThrow("CONNECTION_NOT_FOUND");
 });
 it("isola oportunidades no mesmo canal e exige revisão quando a mensagem é ambígua",async()=>{
  const duplicate=id(5001);
  const jid="5516999990000@s.whatsapp.net";
  await admin();
  await db.query("insert into atendhub_leads(id,organization_id,client_id,name,phone,owner_id) values($1,$2,$3,'Segunda demanda','16999990000',$4)",[duplicate,ORG,CLIENT_A,USER_OTHER]);
  await as(USER_OWNER);
  const first=(await db.query<{id:string}>("select atendhub_inbox_start_conversation($1,$2) id",[lead,CONN_A])).rows[0].id;
  await as(USER_OTHER);
  const second=(await db.query<{id:string}>("select atendhub_inbox_start_conversation($1,$2) id",[duplicate,CONN_A])).rows[0].id;
  expect(second).not.toBe(first);
  expect((await ingest({jid,pmid:"review"})).outcome).toBe("ambiguous_lead");
  expect((await ingest({jid,pmid:"review"})).outcome).toBe("ambiguous_lead");
  await as(USER_OTHER);
  expect(await count("atendhub_inbox_review_items('"+ORG+"') where preview='Olá' and candidates @> '[{\"id\":\""+duplicate+"\"}]'")).toBe(0);
  await expect(db.query("select atendhub_inbox_change_episode($1,'close')",[first])).rejects.toThrow();
  await as(USER_SUPERVISOR);
  const pending=(await db.query<{id:string}>("select id from atendhub_inbox_review_items($1) where candidates @> $2::jsonb",[ORG,JSON.stringify([{id:duplicate}])])).rows[0].id;
  expect((await db.query<{id:string}>("select atendhub_inbox_route_review($1,$2,$3) id",[ORG,pending,duplicate])).rows[0].id).toBe(second);
  expect((await ingest({jid,pmid:"review"})).outcome).toBe("duplicate");
  await as(USER_OWNER);
  expect(await count("atendhub_inbox_messages where provider_message_id='review'")).toBe(0);
  await db.query("select atendhub_inbox_change_episode($1,'close')",[first]);
  expect((await ingest({jid,pmid:"open-only"})).conversationId).toBe(second);
  await as(USER_OTHER);
  await db.query("select atendhub_inbox_change_episode($1,'close')",[second]);
  await expect(db.query("select atendhub_inbox_request_send($1,$2,'oi')",[second,id(6001)])).rejects.toThrow("ATENDIMENTO_ENCERRADO");
  expect((await ingest({jid,pmid:"after-close"})).outcome).toBe("ambiguous_lead");
  await as(USER_OWNER);
  await db.query("select atendhub_inbox_change_episode($1,'resume')",[first]);
  expect((await ingest({jid,pmid:"after-close"})).outcome).toBe("ambiguous_lead");
  expect((await ingest({jid,pmid:"after-resume"})).conversationId).toBe(first);
 });
});

// The deployed lead creation/claim functions are external to the migration tree.
// These doubles exercise the new RPC's transaction and retry contract locally.
it("novo atendimento é atômico, reutiliza a chave e conserva o episódio anterior", async () => {
  await admin();
  await db.exec(`
    alter table atendhub_leads add column idempotency_key text unique;
    create function public.atendhub_create_manual_lead(
      p_organization_id uuid,p_client_id uuid,p_professional_id uuid,p_name text,p_phone text,
      p_email text,p_source text,p_capture_status text,p_next_action text,p_notes text,p_form_id uuid,
      p_form_version_id uuid,p_original_captured_at timestamptz,p_field_values jsonb,p_idempotency_key text,p_actor_id uuid
    ) returns uuid language sql as $$
      insert into public.atendhub_leads(organization_id,client_id,name,phone,idempotency_key)
      values(p_organization_id,p_client_id,p_name,p_phone,p_idempotency_key)
      on conflict(idempotency_key) do update set name=excluded.name returning id;
    $$;
    create function public.atendhub_claim_lead(_organization_id uuid,_lead_id uuid)
    returns uuid language plpgsql as $$
    begin
      if current_setting('app.test_deny_claim',true)='yes' then raise insufficient_privilege; end if;
      update public.atendhub_leads set owner_id=auth.uid() where id=_lead_id and organization_id=_organization_id;
      return _lead_id;
    end $$;
  `);
  await as(USER_OWNER);
  const origin=(await db.query<{id:string}>("select atendhub_inbox_start_conversation($1,$2) id",[id(5000),CONN_A])).rows[0].id;
  const start=(key:string)=>db.query<{id:string}>("select atendhub_inbox_new_episode($1,$2) id",[origin,key]);
  await db.exec("set app.test_deny_claim='yes'");
  await expect(start(id(8100))).rejects.toThrow();
  expect(await count("atendhub_leads where idempotency_key is not null")).toBe(0);
  await db.exec("set app.test_deny_claim='no'");
  const created=(await start(id(8101))).rows[0].id;
  expect(created).not.toBe(origin);
  expect((await start(id(8101))).rows[0].id).toBe(created);
  expect(await count("atendhub_leads where idempotency_key is not null")).toBe(1);
  expect(await count("atendhub_inbox_messages where conversation_id='"+created+"'")).toBe(0);
});

describe("confirmação da véspera", () => {
  beforeAll(async () => {
    await admin();
    // The appointments migration uses btree_gist, unavailable in PGlite.
    // Supply its table contract and the restricted calendar-permission boundary.
    await db.exec(`
      create table public.atendhub_professionals(id uuid primary key,name text);
      create table public.atendhub_appointments(id uuid primary key,organization_id uuid,client_id uuid,
        lead_id uuid,professional_id uuid,created_by_id uuid, starts_at timestamptz,updated_at timestamptz,
        timezone text default 'America/Sao_Paulo',status text default 'awaiting_confirmation',attendance text default 'unknown');
      create function public.atendhub_calendar_allows(uuid,uuid,text,uuid,uuid) returns boolean
        language sql stable as $$select $5=auth.uid()$$;
      insert into public.atendhub_professionals values ('${id(9700)}','Profissional de teste');
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261120160151_20261121000000_atendhub_eve_confirmations.sql",
        "utf8",
      ),
    );
  });
  async function booking(number: number, lead: string) {
    await db.query(
      `insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at)
      values($1,$2,$3,$4,$5,$6,(((now() at time zone 'America/Sao_Paulo')::date+1)+time '12:00') at time zone 'America/Sao_Paulo')`,
      [id(number), ORG, CLIENT_A, id(9700), lead, USER_OWNER],
    );
    return (
      await db.query<{ id: string }>(
        "select id from atendhub_eve_reminders where appointment_id=$1 and invalidated_at is null",
        [id(number)],
      )
    ).rows[0].id;
  }
  it("seleciona a oportunidade pelo código, inclusive quando a resposta chega antes do retorno de envio", async () => {
    await admin();
    const phone = "5516987654321";
    for (const n of [9701, 9702]) {
      await db.query(
        "insert into atendhub_leads(id,organization_id,client_id,name,phone,owner_id) values($1,$2,$3,'Teste',$4,$5)",
        [id(n), ORG, CLIENT_A, phone, USER_OWNER],
      );
      await as(USER_OWNER);
      await db.query("select atendhub_inbox_start_conversation($1,$2)", [
        id(n),
        CONN_A,
      ]);
      await admin();
    }
    const ticket = await booking(9703, id(9702));
    await as(null, "atendhub_integration");
    const claim = async () =>
      (
        await db.query<{ r: { requestId: string; body: string } | null }>(
          "select atendhub_eve_claim($1,'inst-a') r",
          [CLIENT_A],
        )
      ).rows[0].r;
    const work = await claim();
    expect(work?.requestId).toBe(ticket);
    expect(await claim()).toBeNull();
    const body = work!.body.slice(work!.body.lastIndexOf("CONFIRMO"));
    await admin();
    const ts = (
      await db.query<{ ts: string }>("select clock_timestamp()::text ts")
    ).rows[0].ts;
    const event = {
      jid: phone + "@s.whatsapp.net",
      pmid: "eve-reply",
      body,
      ts,
    };
    expect(
      (await ingest({ ...event, pmid: "eve-sim", body: "Sim" })).outcome,
    ).toBe("ambiguous_lead");
    expect(
      (
        await ingest({
          ...event,
          pmid: "eve-other-phone",
          jid: "5516987650000@s.whatsapp.net",
        })
      ).leadId,
    ).not.toBe(id(9702));
    expect((await ingest(event)).leadId).toBe(id(9702));
    expect(await count("atendhub_leads where qualified_at is not null")).toBe(
      0,
    );
    await as(null, "atendhub_integration");
    await db.query("select atendhub_eve_sent($1,'inst-a','provider-out',$2)", [
      ticket,
      ts,
    ]);
    expect((await ingest(event)).outcome).toBe("duplicate");
    expect(
      await count(
        "atendhub_leads where qualified_at is not null and id='" +
          id(9702) +
          "'",
      ),
    ).toBe(1);
    expect(
      await count(
        "atendhub_leads where qualified_at is not null and id='" +
          id(9701) +
          "'",
      ),
    ).toBe(0);
    await db.query(
      "update atendhub_appointments set status='cancelled',attendance='absent' where id=$1",
      [id(9703)],
    );
    expect(await count("atendhub_leads where qualified_at is not null")).toBe(
      1,
    );
  });
  it("exige lembrete, sessão autorizada e ocorrência vigente para confirmação por telefone", async () => {
    await admin();
    const ticket = await booking(9704, id(9701));
    const phone = (action: string) =>
      db.query("select atendhub_eve_phone($1,$2,$3)", [ORG, ticket, action]);
    await as(USER_OTHER);
    await expect(
      db.query("update atendhub_leads set qualified_at=now() where id=$1", [
        id(9701),
      ]),
    ).rejects.toThrow();
    await expect(phone("sent")).rejects.toThrow();
    await as(USER_OWNER);
    await expect(phone("confirmed")).rejects.toThrow("STALE_REMINDER");
    await phone("sent");
    await admin();
    await db.query(
      "update atendhub_appointments set starts_at=starts_at+interval '1 hour' where id=$1",
      [id(9704)],
    );
    await as(USER_OWNER);
    await expect(phone("confirmed")).rejects.toThrow("STALE_REMINDER");
    await admin();
    const fresh = (
      await db.query<{ id: string }>(
        "select id from atendhub_eve_reminders where appointment_id=$1 and invalidated_at is null",
        [id(9704)],
      )
    ).rows[0].id;
    await db.query(
      "update atendhub_appointments set status='confirmed' where id=$1",
      [id(9704)],
    );
    expect(
      await count(
        "atendhub_leads where id='" +
          id(9701) +
          "' and qualified_at is not null",
      ),
    ).toBe(0);
    await as(USER_OWNER);
    for (const action of ["sent", "confirmed", "confirmed"])
      await db.query("select atendhub_eve_phone($1,$2,$3)", [
        ORG,
        fresh,
        action,
      ]);
    await admin();
    expect(
      await count(
        "atendhub_eve_reminders where id='" +
          fresh +
          "' and confirmed_by='" +
          USER_OWNER +
          "'",
      ),
    ).toBe(1);
  });
});

it("reutiliza o histórico fechado e reinicia a fila apenas para uma nova mensagem recebida", async () => {
  await admin();
  await db.exec("alter table atendhub_leads add column assigned_at timestamptz, add column claimed_at timestamptz, add column queue_entered_at timestamptz default now()");
  await db.exec(await readFile("supabase/migrations/20261120200000_atendhub_requeue_closed_conversations.sql", "utf8"));
  const jid = "5516987009999@s.whatsapp.net";
  const original = await ingest({ jid, pmid: "return-original" });
  await db.query("update atendhub_leads set stage='in_progress',owner_id=$2,queue_entered_at=now()-interval '1 day' where id=$1", [original.leadId, USER_OWNER]);
  await as(USER_OWNER);
  await db.query("select atendhub_inbox_change_episode($1,'close')", [original.conversationId]);
  const ts = new Date().toISOString();
  expect((await ingest({ jid, pmid: "return-out", fromMe: true, ts })).conversationId).toBe(original.conversationId);
  expect(await count("atendhub_inbox_conversations where status='closed' and id='" + original.conversationId + "'")).toBe(1);
  expect((await ingest({ jid, pmid: "return-in", ts })).conversationId).toBe(original.conversationId);
  const rows = await db.query("select stage,owner_id,queue_entered_at>now()-interval '1 minute' as fresh from atendhub_leads where id=$1", [original.leadId]);
  expect(rows.rows[0]).toEqual({ stage: "new", owner_id: null, fresh: true });
  expect(await count("atendhub_inbox_messages where conversation_id='" + original.conversationId + "'")).toBe(3);
  expect((await ingest({ jid, pmid: "return-in", ts })).outcome).toBe("duplicate");
});

it("reserva consulta marcada para hoje e só oferece o segundo lembrete após o primeiro envio", async () => {
  await admin();
  await db.exec(`
    alter table atendhub_appointments add column created_at timestamptz not null default now();
    create table public.atendhub_appointment_events(appointment_id uuid,event_type text,created_at timestamptz);
    create function public.atendhub_calendar_manages(uuid,uuid) returns boolean language sql stable
      as $$select public.atendhub_has_client_access($1,$2)$$;
    update atendhub_appointments set status='cancelled' where status='awaiting_confirmation';
  `);
  await db.exec(await readFile("supabase/migrations/20261121120000_atendhub_reminder_windows.sql", "utf8"));
  await as(USER_OWNER);
  await db.query("select atendhub_reminder_preferences($1,$2,1440,120,2,30)", [ORG,CLIENT_A]);
  await admin();
  const jid="5516987009876@s.whatsapp.net";
  const lead=await ingest({jid,pmid:"same-day-new"});
  await db.query(`insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at,timezone)
    values($1,$2,$3,$4,$5,$6,now()+interval '45 minutes',
      case when (now() at time zone 'UTC')::time>time '23:00' then 'America/Sao_Paulo' else 'UTC' end)`,
    [id(9800),ORG,CLIENT_A,id(9700),lead.leadId,USER_OWNER]);
  await as(null,"atendhub_integration");
  const claim=async()=> (await db.query<{reminder:{requestId:string}|null}>("select atendhub_eve_claim($1,'inst-a') reminder",[CLIENT_A])).rows[0].reminder;
  const first=await claim();
  expect(first).not.toBeNull();
  expect(await claim()).toBeNull();
  await db.query("select atendhub_eve_sent($1,'inst-a','same-day-ack',now())",[first!.requestId]);
  expect(await claim()).toBeNull();
  await admin();
  await db.query("update atendhub_eve_reminders set sent_at=now()-interval '31 minutes' where id=$1",[first!.requestId]);
  await db.query("update atendhub_appointments set starts_at=starts_at where id=$1",[id(9800)]);
  await db.query("update atendhub_reminder_settings set second_minutes=60 where client_id=$1",[CLIENT_A]);
  await as(null,"atendhub_integration");
  const second=await claim();
  expect(second).not.toBeNull();
  expect(second?.requestId).not.toBe(first!.requestId);
});

it("envia o aviso mesmo com consulta confirmada e não usa a resposta ao aviso como qualificação", async () => {
  await admin();
  const jid = "5516987009877@s.whatsapp.net";
  const lead = await ingest({ jid, pmid: "notice-contact" });
  await db.query(`insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at,status)
    values($1,$2,$3,$4,$5,$6,now()+interval '10 minutes','confirmed')`, [id(9801),ORG,CLIENT_A,id(9700),lead.leadId,USER_OWNER]);
  await db.exec(await readFile("supabase/migrations/20261121130000_atendhub_reminder_purposes.sql", "utf8"));
  await as(USER_OWNER);
  await db.query("select atendhub_reminder_preferences($1,$2,1440,120,2,60,30)",[ORG,CLIENT_A]);
  await as(null,"atendhub_integration");
  const result=await db.query<{reminder:{requestId:string;purpose:string;body:string;replyText:null}}>("select atendhub_eve_claim($1,'inst-a') reminder", [CLIENT_A]);
  const notice=result.rows[0].reminder;
  expect(notice.purpose).toBe("reminder");
  expect(notice.replyText).toBeNull();
  expect(notice.body).toContain("Lembrete: sua consulta");
  await db.query("select atendhub_eve_sent($1,'inst-a','notice-ack',now())", [notice.requestId]);
  await ingest({jid,pmid:"notice-reply",body:"CONFIRMO "+notice.body.slice(-16),ts:new Date().toISOString()});
  expect(await count("atendhub_leads where qualified_at is not null and id='"+lead.leadId+"'")).toBe(0);
});

it("confirma ou recusa por link e deixa de aceitar o link após cancelamento", async () => {
  await admin();
  await db.exec(await readFile("supabase/migrations/20261121140000_atendhub_public_confirmation_link.sql", "utf8"));
  for (const [i, decision] of [[9810, "confirm"], [9811, "decline"]] as const) {
    const lead=await ingest({jid:`551698700${i}@s.whatsapp.net`,pmid:`public-contact-${i}`});
    await db.query(`insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at)
      values($1,$2,$3,$4,$5,$6,now()+interval '2 hours')`,[id(i),ORG,CLIENT_A,id(9700),lead.leadId,USER_OWNER]);
    const reminder=(await db.query<{id:string}>("select id from atendhub_eve_reminders where appointment_id=$1 and slot=1",[id(i)])).rows[0].id;
    await as(USER_OTHER);
    expect((await db.query<{token:string|null}>("select atendhub_confirmation_link($1,$2) token",[ORG,reminder])).rows[0].token).toBeNull();
    await as(USER_OWNER);
    const token=(await db.query<{token:string}>("select atendhub_confirmation_link($1,$2) token",[ORG,reminder])).rows[0].token;
    expect(token).toBeTruthy();
    await expect(db.query("select atendhub_confirmation_public($1,null)",[token])).rejects.toThrow();
    await as(null,"service_role");
    const respond=async (value:string|null)=>(await db.query<{answer:{state:string}|null}>("select atendhub_confirmation_public($1,$2) answer",[token,value])).rows[0].answer?.state;
    expect(await respond(null)).toBe("pending");
    expect(await respond(decision)).toBe(decision==="confirm"?"confirmed":"declined");
    expect(await respond(decision==="confirm"?"decline":"confirm")).toBe(decision==="confirm"?"confirmed":"declined");
    await admin();
    const state=(await db.query("select a.status,l.qualified_at is not null qualified from atendhub_appointments a join atendhub_leads l on l.id=a.lead_id where a.id=$1",[id(i)])).rows[0];
    expect(state).toEqual({status:decision==="confirm"?"confirmed":"rescheduling",qualified:decision==="confirm"});
    await db.query("update atendhub_appointments set status='cancelled' where id=$1",[id(i)]);
    await as(null,"service_role");
    expect(await respond("confirm")).toBeUndefined();
  }
});

it("envia o link público no corpo reservado e registra exatamente o texto enviado", async () => {
  await admin();
  await db.exec("alter table atendhub_professionals add column organization_id uuid, add column client_id uuid");
  await db.query("update atendhub_professionals set organization_id=$1,client_id=$2 where id=$3",[ORG,CLIENT_A,id(9700)]);
  await db.exec("update atendhub_appointments set status='cancelled' where status<>'cancelled'");
  await db.exec(await readFile("supabase/migrations/20261121150000_atendhub_automatic_confirmation_link.sql", "utf8"));
  const jid="5516987009982@s.whatsapp.net";
  const lead=await ingest({jid,pmid:"auto-link-contact"});
  await db.query(`insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at,timezone)
      values($1,$2,$3,$4,$5,$6,now()+interval '45 minutes',
      case when (now() at time zone 'UTC')::time>time '23:00' then 'America/Sao_Paulo' else 'UTC' end)`,
      [id(9812),ORG,CLIENT_A,id(9700),lead.leadId,USER_OWNER]);
  await as(null,"atendhub_integration");
  const item=(await db.query<{r:{requestId:string;body:string;confirmationUrl:string;replyText:null}}>("select atendhub_eve_claim($1,'inst-a','https://agenda.example.com') r",[CLIENT_A])).rows[0].r;
  expect(item.body).toContain(item.confirmationUrl);
  expect(item.confirmationUrl).toMatch(/^https:\/\/agenda\.example\.com\/confirmar\/[0-9a-f-]{36}$/);
  expect(item.replyText).toBeNull();
  await db.query("select atendhub_eve_sent($1,'inst-a','auto-link-ack',now())",[item.requestId]);
  await admin();
  const sentMessage = await db.query<{ body: string }>(
    "select body from atendhub_inbox_messages where provider_message_id='auto-link-ack'",
  );
  expect(sentMessage.rows).toHaveLength(1);
  expect(sentMessage.rows[0].body).toBe(item.body);
});

it("usa o domínio ativo da clínica e rejeita a confirmação por outro subdomínio", async () => {
  await admin();
  await db.exec("update atendhub_appointments set status='cancelled' where status<>'cancelled'");
  await db.exec(await readFile("supabase/migrations/20261121160000_atendhub_client_domains.sql", "utf8"));
  await db.query("insert into atendhub_client_domains(client_id,organization_id,slug,active) values($1,$2,'clinica-teste',true)", [CLIENT_A,ORG]);
  const lead=await ingest({jid:"5516987009983@s.whatsapp.net",pmid:"domain-contact"});
  await db.query(`insert into atendhub_appointments(id,organization_id,client_id,professional_id,lead_id,created_by_id,starts_at,timezone)
    values($1,$2,$3,$4,$5,$6,now()+interval '45 minutes',
    case when (now() at time zone 'UTC')::time>time '23:00' then 'America/Sao_Paulo' else 'UTC' end)`,[id(9813),ORG,CLIENT_A,id(9700),lead.leadId,USER_OWNER]);
  await as(null,"atendhub_integration");
  const result=await db.query<{r:{confirmationUrl:string}}>("select atendhub_eve_claim($1,'inst-a','https://atendehub.app') r",[CLIENT_A]);
  const url=new URL(result.rows[0].r.confirmationUrl);
  expect(url.hostname).toBe("clinica-teste.atendehub.app");
  await as(null,"service_role");
  const token=url.pathname.split("/").at(-1);
  const query="select atendhub_confirmation_public($1,null,$2) r";
  expect((await db.query(query,[token,CLIENT_B])).rows[0]).toEqual({r:null});
  expect((await db.query<{r:{state:string}}>(query,[token,CLIENT_A])).rows[0].r.state).toBe("pending");
});
