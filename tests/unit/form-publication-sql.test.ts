import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makePersistedPathForm } from "../editor-harness/path-fixture";
import { persistedForm } from "@/features/forms/services/persisted-form";

const form = makePersistedPathForm();
const version = form.versions[0];
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
    create table atendhub_team_members(id uuid, organization_id uuid, status text);
    create table atendhub_clients(id uuid, organization_id uuid);
    create table atendhub_forms(id uuid primary key, organization_id uuid, client_id uuid, doctor_id uuid,
      name text, description text, slug text unique, status text, active_version_id uuid, updated_at timestamptz default now());
    create table atendhub_form_versions(id uuid primary key, organization_id uuid, client_id uuid, form_id uuid references atendhub_forms,
      number integer, state text, definition jsonb, paths jsonb, choice_assets jsonb, created_by_id uuid, unique(form_id,number));
    create table atendhub_leads(id uuid primary key default gen_random_uuid(), organization_id uuid, client_id uuid, professional_id uuid,
      name text, phone text, email text, source text, capture_status text, stage text, form_id uuid, form_version_id uuid,
      origin_submission_id uuid, field_values jsonb, idempotency_key text, original_captured_at timestamptz, next_action text);
    create table atendhub_lead_responses(organization_id uuid, client_id uuid, lead_id uuid, form_id uuid, form_version_id uuid,
      question_id uuid, question_snapshot jsonb, value jsonb, unique(lead_id,question_id));
  `);
  await db.query(
    "insert into atendhub_team_members values(auth.uid(),$1,'active')",
    [form.organizationId],
  );
  await db.query("insert into atendhub_clients values($1,$2)", [
    form.clientId,
    form.organizationId,
  ]);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261125010000_atendhub_publish_forms.sql",
      "utf8",
    ),
  );
});
afterAll(() => db.close());

it("mantém a publicação anônima durante a edição e grava apenas as respostas do último percurso", async () => {
  async function save(
    create: boolean,
    v: typeof version,
    publish: boolean,
    slug: string,
    since?: string,
  ) {
    const result = await db.query<{
      result: {
        form: Parameters<typeof persistedForm>[0];
        versions: Parameters<typeof persistedForm>[1];
      };
    }>(
      "select atendhub_save_form_version($1,$2,$3,$4,$5,$6,$7,$8,$9) as result",
      [
        form.organizationId,
        form.clientId,
        form.id,
        create,
        { name: form.name, slug },
        v,
        form.fields,
        publish,
        since ?? null,
      ],
    );
    return result.rows[0].result;
  }
  const draft = await save(true, version, false, "original");
  expect(persistedForm(draft.form, draft.versions).publishedSlug).toBeNull();
  const live = await save(
    false,
    version,
    true,
    "original",
    draft.form.updated_at,
  );
  expect(live.form.active_version_id).toBe(version.id);
  const v2 = { ...version, id: crypto.randomUUID(), number: 2 };
  const saved = await save(false, v2, false, "editado", live.form.updated_at);
  expect(persistedForm(saved.form, saved.versions)).toMatchObject({
    slug: "editado",
    publishedSlug: "original",
    activeVersionId: v2.id,
  });
  expect(
    persistedForm(
      saved.form,
      saved.versions.filter((v) => v.id === saved.form.active_version_id),
      false,
    ),
  ).toMatchObject({ slug: "original", activeVersionId: version.id });
  await expect(
    save(false, v2, true, "editado", live.form.updated_at),
  ).rejects.toThrow();
  const updated = await save(false, v2, true, "editado", saved.form.updated_at);
  expect(updated.form.slug).toBe("editado");
  const key = crypto.randomUUID();
  const capture = (versionId: string, question: string, complete: boolean) =>
    db.query<{ id: string }>(
      "select atendhub_capture_form_answers($1,$2,$3,$4,$5,$6) as id",
      [
        form.id,
        versionId,
        key,
        { name: "Teste", phone: "", email: "" },
        [
          {
            question_id: question,
            question_snapshot: { label: "Pergunta" },
            value: "Resposta",
          },
        ],
        complete,
      ],
    );
  const [a, b] = version.steps.slice(1, 3).map((s) => s.question.id);
  await expect(capture(version.id, a, true)).rejects.toThrow();
  const partial = await capture(v2.id, a, false);
  const completed = await capture(v2.id, b, true);
  expect(completed.rows).toEqual(partial.rows);
  expect((await capture(v2.id, a, false)).rows).toEqual(partial.rows);
  expect(
    (await db.query("select question_id from atendhub_lead_responses")).rows,
  ).toEqual([{ question_id: b }]);
  expect(
    (await db.query("select capture_status from atendhub_leads")).rows,
  ).toEqual([{ capture_status: "completed" }]);
});
