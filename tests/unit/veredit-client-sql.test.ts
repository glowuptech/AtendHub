import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uuid(1);
const outside = uuid(2);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);",
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261106000000_atendhub_foundation.sql",
      "utf8",
    ),
  );
  await db.exec(`
    alter table atendhub_clients add column metadata jsonb not null default '{}';
    create function public.atendhub_is_super_admin(org uuid) returns boolean
      language sql stable as $$ select org::text = current_setting('test.admin_org', true) $$;
    create policy read_operation on atendhub_operations for select to authenticated
      using (public.atendhub_is_super_admin(organization_id));
    create policy create_client on atendhub_clients for insert to authenticated
      with check (public.atendhub_is_super_admin(organization_id));
    create policy create_professional on atendhub_professionals for insert to authenticated
      with check (public.atendhub_is_super_admin(organization_id));
    grant select on atendhub_operations to authenticated;
    grant insert on atendhub_clients, atendhub_professionals to authenticated;
    insert into atendhub_organizations (id,name) values ('${org}','GlowUp'),('${outside}','Outra');
    insert into atendhub_operations (organization_id,code,name,status) values
      ('${org}','prescrita','Prescrita','active'),('${org}','veredite','Veredite','inactive');
  `);
  await db.exec(
    await readFile(
      "supabase/migrations/20261124220000_atendhub_create_client_with_professionals.sql",
      "utf8",
    ),
  );
});

afterAll(async () => db?.close());

async function createClient(
  target: string,
  id: string,
  vertical: string,
  document: string,
  duplicate = false,
) {
  const member = {
    id,
    name: "Pessoa Profissional",
    crm: document,
    uf: "MG",
    specialties: ["Família"],
  };
  await db.exec(`set role authenticated; set test.admin_org = '${org}';`);
  try {
    return await db.query(
      "select atendhub_create_client_with_professionals($1,$2,'Cliente teste','active',$3::jsonb,$4::jsonb) as id",
      [
        target,
        id,
        JSON.stringify({ vertical, branding: "sage", doctors: [member] }),
        JSON.stringify(duplicate ? [member, member] : [member]),
      ],
    );
  } finally {
    await db.exec("reset role;");
  }
}

it("cria o escritório e o profissional legal na operação do cadastro", async () => {
  expect((await createClient(org, uuid(11), "legal", "123456-A")).rows).toEqual(
    [{ id: uuid(11) }],
  );
  const result = await db.query(`
    select op.code, p.professional_type, p.crm, c.metadata#>>'{doctors,0,uf}' as uf
    from atendhub_clients c join atendhub_operations op on op.id=c.operation_id
    join atendhub_professionals p on p.client_id=c.id
  `);
  expect(result.rows).toEqual([
    { code: "veredite", professional_type: "legal", crm: "123456-A", uf: "MG" },
  ]);
});

it("a aparência não muda a operação de um cadastro de Saúde", async () => {
  await createClient(org, uuid(12), "healthcare", "456123");
  const result = await db.query(
    `select op.code, p.professional_type
     from atendhub_clients c join atendhub_operations op on op.id=c.operation_id
     join atendhub_professionals p on p.client_id=c.id
     where c.id=$1`,
    [uuid(12)],
  );
  expect(result.rows).toEqual([
    { code: "prescrita", professional_type: "health" },
  ]);
});

it("recusa outra organização e reverte o cadastro se um profissional falhar", async () => {
  await expect(
    createClient(outside, uuid(20), "legal", "456123"),
  ).rejects.toThrow("Somente superadministradores");
  await expect(
    createClient(org, uuid(21), "healthcare", "78910", true),
  ).rejects.toThrow();
  const result = await db.query(
    "select id from atendhub_clients where id = any($1::uuid[])",
    [[uuid(20), uuid(21)]],
  );
  expect(result.rows).toEqual([]);
});
