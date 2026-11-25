import { expect, it, vi } from "vitest";
import { makePersistedPathForm } from "../editor-harness/path-fixture";
import { settingsOf } from "@/features/forms/services/settings";
import { questionStage } from "@/features/forms/services/button-events";
import { POST } from "@/app/api/forms/[formId]/route";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: auth,
}));
vi.mock("@/lib/supabase/organization-admin", () => ({
  apiError: () => Response.json({}, { status: 409 }),
}));

it("duplica o rascunho atual com seus campos e configurações e reconhece uma repetição", async () => {
  const source = makePersistedPathForm("snapshot");
  const active = source.versions[0];
  const draft = structuredClone(active);
  draft.id = crypto.randomUUID();
  draft.number = 2;
  draft.state = "draft";
  draft.settings = settingsOf({
    tracking: {
      pixelId: "1234567890",
      buttonEvents: {
        iniciar: "Contact",
        [`voltar-${questionStage(draft.steps[1])}`]: "VoltarPergunta",
      },
    },
  });
  draft.steps[0].metaEvent = "EscolheuTurno";
  const scope = {
    client_id: source.clientId,
    organization_id: source.organizationId,
  };
  const rows = [active, draft].map((v) => ({
    ...scope,
    id: v.id,
    form_id: source.id,
    number: v.number,
    state: v.state,
    definition: {
      version: v,
      fields: source.fields,
      details: {
        name: v.state === "draft" ? "Nova campanha" : source.name,
        slug: source.slug,
        doctorId: null,
        description: source.description,
      },
    },
  }));
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({
        data: {
          ...scope,
          id: source.id,
          slug: source.slug,
          name: source.name,
          description: source.description,
          doctor_id: null,
          active_version_id: active.id,
          status: "demo",
        },
      }),
    order: vi.fn().mockResolvedValue({ data: rows }),
    maybeSingle: vi.fn(),
  };
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: { code: "23505" } });
  auth.mockResolvedValue({
    organizationId: source.organizationId,
    supabase: { from: () => chain, rpc },
  });
  const ids = { copyId: crypto.randomUUID(), versionId: crypto.randomUUID() };
  const submit = () =>
    POST(
      new Request("http://local/api/forms/" + source.id, {
        method: "POST",
        body: JSON.stringify({ action: "duplicate", ...ids }),
      }),
      { params: Promise.resolve({ formId: source.id }) },
    );
  const response = await submit();
  expect(response?.status).toBe(201);
  expect(await response?.json()).toEqual({ id: ids.copyId });
  const [procedure, payload] = rpc.mock.calls[0];
  expect(procedure).toBe("atendhub_save_form_version");
  expect(payload).toMatchObject({
    p_org: source.organizationId,
    p_client: source.clientId,
    p_form: ids.copyId,
    p_create: true,
    p_publish: false,
    p_details: { name: "Nova campanha — cópia" },
    p_fields: source.fields,
    p_version: {
      id: ids.versionId,
      formId: ids.copyId,
      state: "draft",
      number: 1,
      settings: draft.settings,
      paths: draft.paths,
    },
  });
  expect(payload.p_details.slug).not.toBe(source.slug);
  const copies = payload.p_version.steps as typeof draft.steps;
  for (const [i, step] of copies.entries()) {
    expect(step.id).not.toBe(draft.steps[i].id);
    expect(step.question.id).not.toBe(draft.steps[i].question.id);
    expect(step.actionId).not.toBe(draft.steps[i].actionId);
    expect(questionStage(step)).toBe(questionStage(draft.steps[i]));
    expect(step.question.fieldDefinitionId).toBe(
      draft.steps[i].question.fieldDefinitionId,
    );
    expect(step.question.pathIds).toEqual(draft.steps[i].question.pathIds);
    expect(step.metaEvent).toBe(draft.steps[i].metaEvent);
  }
  chain.maybeSingle.mockResolvedValue({ data: { id: ids.versionId } });
  expect((await submit())?.status).toBe(200);
  expect(chain.eq).toHaveBeenCalledWith("form_id", ids.copyId);
  expect(chain.eq).toHaveBeenCalledWith("id", ids.versionId);
});
