import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uuid(1),
  otherOrg = uuid(2),
  clientA = uuid(11),
  clientB = uuid(12),
  outsider = uuid(13),
  line = uuid(51),
  conversation = uuid(52),
  lead = uuid(53),
  message = uuid(54),
  later = uuid(55);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;create role authenticated;create role service_role;create role atendhub_integration;
    create table public.atendhub_clients(id uuid,organization_id uuid,name text,unique(id,organization_id));
    create table public.atendhub_leads(id uuid,organization_id uuid,client_id uuid,form_id uuid,created_at timestamptz default now(),
      unique(id,organization_id,client_id));
    create table public.atendhub_whatsapp_connections(id uuid,organization_id uuid,client_id uuid,status text,unique(id,organization_id,client_id));
    create table public.atendhub_inbox_conversations(id uuid primary key,organization_id uuid,client_id uuid,lead_id uuid,connection_id uuid);
    create table public.atendhub_inbox_messages(id uuid primary key,conversation_id uuid,direction text,origin text,message_type text,
      body text,recorded_at timestamptz not null,occurred_at timestamptz not null);
  `);
  await db.query(
    "insert into atendhub_clients values($1,$2,'A'),($3,$2,'B'),($4,$5,'Fora')",
    [clientA, org, clientB, outsider, otherOrg],
  );
  for (const file of [
    "20261123000000_atendhub_paid_media",
    "20261123010000_atendhub_paid_attribution",
    "20261123020000_atendhub_paid_media_assistant",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
const link = (client: string, mode: string, account = "act_123") =>
  db.query(
    "select atendhub_meta_link($1,$2,$3,$4,'Agência','BRL','America/Sao_Paulo')",
    [org, account, client, mode],
  );
const insight = (ad_id: string, spend: number) => ({
  ad_id,
  day: "2026-11-20",
  spend,
  impressions: 400,
});
async function publish(
  rows: { campaign_id: string; name: string; ad_id: string; spend: number }[],
  started = "2026-11-23T09:00Z",
) {
  return db.query<{ ok: boolean }>(
    `select atendhub_meta_import($1,'act_123','2026-11-20','2026-11-20',$2,$3::jsonb,$4::jsonb,$5::jsonb) ok`,
    [
      org,
      started,
      JSON.stringify(
        rows.map(({ campaign_id, name }) => ({ campaign_id, name })),
      ),
      JSON.stringify(
        rows.map(({ ad_id, campaign_id, name }) => ({
          ad_id,
          campaign_id,
          name,
        })),
      ),
      JSON.stringify(rows.map(({ ad_id, spend }) => insight(ad_id, spend))),
    ],
  );
}
it("impede conta exclusiva em dois clientes e concilia a conta compartilhada preservando IDs", async () => {
  await link(clientA, "exclusive");
  await expect(link(clientB, "shared")).rejects.toThrow(
    "ACCOUNT_MODE_CONFLICT",
  );
  await expect(link(outsider, "shared", "act_888")).rejects.toThrow();
  await link(clientA, "shared");
  await link(clientB, "shared");
  const rows = (
    await db.query<{ client_id: string; code: string }>(
      "select client_id,code from atendhub_meta_client_codes order by client_id",
    )
  ).rows;
  const first = {
    campaign_id: "100",
    name: `[${rows[0].code}][ATR] Perfil`,
    ad_id: "1000",
    spend: 11.25,
  };
  const second = {
    campaign_id: "200",
    name: `[${rows[1].code}][INT] Vídeo`,
    ad_id: "2000",
    spend: 3,
  };
  const third = {
    campaign_id: "300",
    name: "[ACA] Sem código",
    ad_id: "3000",
    spend: 5.75,
  };
  expect((await publish([first, second, third])).rows[0].ok).toBe(true);
  const mapped = await db.query(
    "select client_id,stage from atendhub_meta_campaigns order by campaign_id",
  );
  expect(mapped.rows).toEqual([
    { client_id: clientA, stage: "ATR" },
    { client_id: clientB, stage: "INT" },
    { client_id: null, stage: "ACA" },
  ]);
  await db.query(
    "update atendhub_meta_campaigns set client_id=$1,stage='DES',manual=true where campaign_id='300'",
    [clientA],
  );
  expect(
    (
      await publish(
        [{ ...first, name: "Nome novo", spend: 10 }, second, third],
        "2026-11-23T09:10Z",
      )
    ).rows[0].ok,
  ).toBe(true);
  expect((await publish([])).rows[0].ok).toBe(false);
  expect(
    (
      await db.query(
        "select client_id,stage from atendhub_meta_campaigns order by campaign_id",
      )
    ).rows,
  ).toEqual([
    { client_id: clientA, stage: "ATR" },
    { client_id: clientB, stage: "INT" },
    { client_id: clientA, stage: "DES" },
  ]);
  expect(
    (
      await db.query(
        "select sum(spend)::float8 spend from atendhub_meta_ad_insights",
      )
    ).rows[0],
  ).toEqual({ spend: 18.75 });
  await expect(
    publish([{ ...first, campaign_id: "400" }], "2026-11-23T10:00Z"),
  ).rejects.toThrow("AD_CAMPAIGN_CONFLICT");
  expect(
    (
      await db.query(
        "select count(*)::int n from atendhub_meta_campaigns where campaign_id='400'",
      )
    ).rows[0],
  ).toEqual({ n: 0 });
  await db.exec("set role authenticated");
  await expect(
    db.query("select * from atendhub_meta_campaigns"),
  ).rejects.toThrow();
  await db.exec("reset role");
});
it("atribui formulário e primeira mensagem à campanha do cliente, com prioridade para ad ID", async () => {
  await db.query(
    "insert into atendhub_leads(id,organization_id,client_id,form_id) values($1,$2,$3,$4)",
    [lead, org, clientA, uuid(59)],
  );
  await db.query(
    "insert into atendhub_whatsapp_connections values($1,$2,$3,'connected')",
    [line, org, clientA],
  );
  await db.query(
    "insert into atendhub_inbox_conversations values($1,$2,$3,$4,$5)",
    [conversation, org, clientA, lead, line],
  );
  const save = (campaign: string, phrase: string) =>
    db.query("select atendhub_save_paid_whatsapp_rule($1,$2,$3,$4,$5)", [
      org,
      clientA,
      line,
      campaign,
      phrase,
    ]);
  await expect(save("200", "Olá, quero saber mais")).rejects.toThrow(
    "INVALID_PAID_RULE",
  );
  await save("300", "Olá, quero saber mais");
  await expect(save("100", "OLÁ quero saber mais!")).rejects.toThrow();
  const form = (campaign: string) =>
    db.query<{ ok: boolean }>(
      "select atendhub_attribute_form_campaign($1,$2,$3,$4,null) ok",
      [org, clientA, lead, campaign],
    );
  expect((await form("200")).rows[0].ok).toBe(false);
  expect((await form("100")).rows[0].ok).toBe(true);
  expect((await form("300")).rows[0].ok).toBe(false);
  await db.query(
    "insert into atendhub_inbox_messages values($1,$2,'inbound','contact','text','Olá! Quero saber mais','2026-11-23 09:00Z','2026-11-23 09:00Z')",
    [message, conversation],
  );
  await db.query(
    "insert into atendhub_inbox_messages values($1,$2,'inbound','contact','text','depois','2026-11-23 09:01Z','2026-11-23 09:01Z')",
    [later, conversation],
  );
  const fromAd = (m: string, ad: string) =>
    db.query<{ ok: boolean }>(
      "select atendhub_attribute_whatsapp_campaign($1,$2) ok",
      [m, ad],
    );
  expect((await fromAd(later, "1000")).rows[0].ok).toBe(false);
  expect((await fromAd(message, "2000")).rows[0].ok).toBe(false);
  expect((await fromAd(message, "1000")).rows[0].ok).toBe(true);
  expect(
    (
      await db.query(
        "select channel,evidence,campaign_id,ad_id from atendhub_paid_attributions order by channel",
      )
    ).rows,
  ).toEqual([
    {
      channel: "form",
      evidence: "form_parameter",
      campaign_id: "100",
      ad_id: null,
    },
    {
      channel: "whatsapp",
      evidence: "whatsapp_ad",
      campaign_id: "100",
      ad_id: "1000",
    },
  ]);
});
