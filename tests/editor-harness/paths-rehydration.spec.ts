import { test, expect } from "@playwright/test";
import { settingsOf } from "@/features/forms/services/settings";
import { makePersistedPathForm } from "./path-fixture";

async function seedPersistedForm(
  page: import("@playwright/test").Page,
  form: ReturnType<typeof makePersistedPathForm>,
) {
  await page.addInitScript((value) => {
    localStorage.setItem("editor-test-draft", JSON.stringify(value));
  }, form);
}

async function openPaths(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /05 Caminhos/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
}

async function openDiagnostic(page: import("@playwright/test").Page) {
  const panel = page.getByTestId("path-diagnostics");
  if ((await panel.getAttribute("open")) === null) {
    await panel.locator("summary").click();
  }
  return panel.locator("pre");
}

test("reidrata vínculos persistidos após carga assíncrona e mantém edição manual", async ({
  page,
}) => {
  const persisted = makePersistedPathForm();
  await seedPersistedForm(page, persisted);
  await page.goto("/tests/editor-harness/index.html?async-source");
  await expect(
    page.getByRole("heading", { name: "Editor de formulário" }),
  ).toBeVisible();
  await openPaths(page);

  const branchA = page.getByRole("region", { name: "Resposta Manhã" });
  const branchB = page.getByRole("region", { name: "Resposta Tarde" });
  await branchA.locator("summary").click();
  await branchB.locator("summary").click();
  await expect(
    branchA
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).toBeChecked();
  await expect(
    branchB
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).not.toBeChecked();
  await expect(
    branchB
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .last(),
  ).toBeChecked();
  await expect(
    branchA.getByRole("checkbox", { name: "Pergunta comum" }),
  ).toBeChecked();
  await expect(
    branchB.getByRole("checkbox", { name: "Pergunta comum" }),
  ).toBeChecked();

  const reportElement = await openDiagnostic(page);
  const report = JSON.parse((await reportElement.textContent()) ?? "{}");
  expect(report.received.activeVersionId).toBe(persisted.activeVersionId);
  expect(report.received.availablePathIds).toEqual(["caminho_a", "caminho_b"]);
  expect(
    report.displayed.questions.map(
      (question: { pathIds: string[] }) => question.pathIds,
    ),
  ).toEqual([[], ["caminho_a"], ["caminho_b"], []]);
  const duplicateTitleIds = report.displayed.questions
    .filter(
      (question: { questionId: string }, index: number) =>
        index === 1 || index === 2,
    )
    .map((question: { questionId: string }) => question.questionId);
  expect(new Set(duplicateTitleIds).size).toBe(2);
  expect(
    report.displayed.optionDestinations.map(
      (option: { pathId: string }) => option.pathId,
    ),
  ).toEqual(["caminho_a", "caminho_b"]);
  expect(report.displayed.orphanedQuestionReferences).toEqual([]);
  expect(report.displayed.orphanedOptionReferences).toEqual([]);

  await page.getByRole("button", { name: /06 Perguntas/ }).click();
  await openPaths(page);
  const reopenedBranchA = page.getByRole("region", { name: "Resposta Manhã" });
  await reopenedBranchA.locator("summary").click();
  await expect(
    reopenedBranchA
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText("salvo");
  const savedReport = JSON.parse(
    (await (await openDiagnostic(page)).textContent()) ?? "{}",
  );
  expect(savedReport.lastSave.status).toBe("confirmado");
  expect(savedReport.lastSave.request.questions).toEqual(
    savedReport.lastSave.response.questions,
  );
});

test("prepara snapshot publicado sem trocar IDs de caminhos e reabre o rascunho retornado", async ({
  page,
}) => {
  const persisted = makePersistedPathForm("snapshot");
  await seedPersistedForm(page, persisted);
  await page.goto("/tests/editor-harness/index.html");
  await openPaths(page);
  const branchA = page.getByRole("region", { name: "Resposta Manhã" });
  await branchA.locator("summary").click();
  await expect(
    branchA
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).toBeChecked();

  const reportElement = await openDiagnostic(page);
  const report = JSON.parse((await reportElement.textContent()) ?? "{}");
  expect(report.received.displayedVersion.id).toBe(persisted.activeVersionId);
  expect(report.received.displayedVersion.state).toBe("snapshot");
  expect(report.displayed.displayedVersion.id).not.toBe(
    persisted.activeVersionId,
  );
  expect(report.displayed.displayedVersion.state).toBe("draft");
  expect(report.initialization.snapshotPreparedForEditing).toBe(true);
  expect(report.initialization.pathIdsPreserved).toBe(true);
  expect(report.displayed.availablePathIds).toEqual(["caminho_a", "caminho_b"]);

  await page.getByRole("button", { name: "Copiar diagnóstico" }).click();
  await expect(
    page.getByTestId("path-diagnostics").getByRole("status"),
  ).toContainText(/Diagnóstico copiado|Não foi possível copiar/);
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText("salvo");
  const savedReport = JSON.parse(
    (await (await openDiagnostic(page)).textContent()) ?? "{}",
  );
  expect(savedReport.lastSave.status).toBe("confirmado");
  expect(savedReport.lastSave.response.availablePathIds).toEqual([
    "caminho_a",
    "caminho_b",
  ]);
  await page.reload();
  await openPaths(page);
  const reloadedBranch = page.getByRole("region", { name: "Resposta Manhã" });
  await reloadedBranch.locator("summary").click();
  await expect(
    reloadedBranch
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).toBeChecked();
});

test("usa fields da versão recebida, não associa fields de outra versão às etapas", async ({
  page,
}) => {
  const persisted = makePersistedPathForm();
  persisted.fields[2].options[0].pathId = "path_from_other_version";
  await seedPersistedForm(page, persisted);
  await page.goto("/tests/editor-harness/index.html");
  await openPaths(page);
  const branchA = page.getByRole("region", { name: "Resposta Manhã" });
  await branchA.locator("summary").click();
  await expect(
    branchA
      .getByRole("checkbox", { name: "Pergunta com título duplicado" })
      .first(),
  ).toBeChecked();

  const reportElement = await openDiagnostic(page);
  const report = JSON.parse((await reportElement.textContent()) ?? "{}");
  expect(report.initialization.sourceOptionPathIds[0].pathId).toBe(
    "path_from_other_version",
  );
  expect(report.initialization.selectedVersionOptionPathIds[0].pathId).toBe(
    "caminho_a",
  );
  expect(report.displayed.orphanedOptionReferences).toEqual([]);
});

test("avisa referências órfãs sem renomear caminho nem associação", async ({
  page,
}) => {
  const persisted = makePersistedPathForm();
  persisted.fields[2].options[0].pathId = "path_legacy_generated";
  // The editor resolves choices from the selected version when it contains its own fields.
  Object.assign(persisted.versions[0], {
    fields: structuredClone(persisted.fields),
  });
  await seedPersistedForm(page, persisted);
  await page.goto("/tests/editor-harness/index.html");
  await openPaths(page);

  await expect(page.getByRole("alert")).toContainText("path_legacy_generated");
  const reportElement = await openDiagnostic(page);
  const report = JSON.parse((await reportElement.textContent()) ?? "{}");
  expect(report.received.availablePathIds).toContain("caminho_a");
  expect(report.received.orphanedOptionReferences).toEqual([
    {
      fieldDefinitionId: persisted.fields[2].id,
      optionId: persisted.fields[2].options[0].id,
      pathId: "path_legacy_generated",
    },
  ]);
  expect(persisted.fields[2].options[0].pathId).toBe("path_legacy_generated");
});

test("salvar e publicar exibe um link que permanece ao reabrir o editor", async ({
  page,
}) => {
  const form = makePersistedPathForm();
  form.versions[0].steps[0].question.required = true;
  await page.addInitScript((value) => {
    if (!localStorage.getItem("editor-test-draft"))
      localStorage.setItem("editor-test-draft", JSON.stringify(value));
  }, form);
  await page.goto("/tests/editor-harness/index.html");
  await expect(page.getByLabel("Link público")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar e publicar" }).click();
  const url = "https://atendehub.app/f/" + form.slug;
  await expect(page.getByLabel("Link público")).toHaveValue(url);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Abrir formulário" }),
  ).toHaveAttribute("href", url);
});

test("formulário público segue a resposta atual e aguarda a gravação antes de concluir", async ({
  page,
}) => {
  const form = makePersistedPathForm("snapshot");
  const [router, a, b, common] = form.versions[0].steps;
  a.question.label = "Pergunta da manhã";
  b.question.label = "Pergunta da tarde";
  common.question.selectedPathsOnly = true;
  const field = form.fields.find(
    (f) => f.id === router.question.fieldDefinitionId,
  )!;
  const pixelId = "1234567890";
  const settings = settingsOf(form.versions[0].settings);
  settings.tracking = { ...settings.tracking, pixelId, viewSeconds: 10, pageView: true, lead: true };
  form.versions[0].settings = settings;
  settings.introduction.mode = "separate";
  settings.tracking.buttonEvents = {
    iniciar: "Contact",
    [`apresentar-pergunta-${a.id}`]: "ReverInicio",
    [`voltar-pergunta-${a.id}`]: "VoltouDaManha",
    "avancar-contato": "CompleteRegistration",
  };
  router.metaEvent = "EscolheuTurno";
  let scriptLoads = 0;
  await page.route("https://connect.facebook.net/en_US/fbevents.js", async (route) => {
    scriptLoads++;
    await route.fulfill({ contentType: "application/javascript", body: "/* SDK interceptado para o teste */" });
  });
  const commands = () => page.evaluate(() => window.fbq?.queue);
  await page.clock.install();
  form.slug = "formulario-publicado";
  form.versions[0].successMessage = "Recebemos seu cadastro.";
  await page.addInitScript((fixture) => {
    localStorage.setItem("public-test-form", JSON.stringify(fixture));
  }, { ...form, clinicName: "Clínica" });
  let captures = 0;
  let key: string | undefined;
  await page.route(
    "**/api/public/forms/formulario-publicado",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      const body = route.request().postDataJSON();
      if (body.eventType) return route.fulfill({ json: { ok: true } });
      expect(body.answers[router.question.id]).toBe(field.options[1].id);
      expect(body.answers).not.toHaveProperty(a.question.id);
      expect(body.answers).not.toHaveProperty(common.question.id);
      key ??= body.idempotencyKey;
      expect(body.idempotencyKey).toBe(key);
      captures++;
      if (captures === 1) return route.fulfill({ status: 409, json: { error: "Tente novamente." } });
      if (captures === 2) return route.fulfill({ json: { ok: true } });
      return route.fulfill({ status: 201, json: { ok: true, complete: true, leadId: crypto.randomUUID() } });
    },
  );
  await page.goto("/tests/editor-harness/index.html?public-form&utm_source=meta&etapa=concluido&acao=antiga");
  await expect(page).toHaveURL(/etapa=apresentacao/);
  await expect.poll(() => scriptLoads).toBe(1);
  await expect.poll(commands).toEqual([["set", "autoConfig", "false", pixelId], ["init", pixelId]]);
  await page.clock.runFor(10_250);
  await expect.poll(commands).toContainEqual(["trackSingle", pixelId, "PageView"]);
  await page.getByRole("button", { name: settings.introduction.buttonLabel }).click();
  await expect(page).toHaveURL(new RegExp(`etapa=pergunta-${router.id}&acao=iniciar`));
  await page.getByRole("radio", { name: "Manhã" }).click();
  await expect(
    page.getByRole("heading", { name: a.question.label }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Apresentação", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar" }).click();
  await page.getByRole("radio", { name: "Tarde" }).click();
  await expect(
    page.getByRole("heading", { name: b.question.label }),
  ).toBeVisible();
  await page.getByLabel(b.question.label, { exact: true }).fill("+5511987654321");
  await expect(page.getByLabel(b.question.label, { exact: true })).toHaveValue("(11) 98765-4321");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome", { exact: false }).fill("Paciente Teste");
  const phone = page.getByLabel("WhatsApp", { exact: false });
  await phone.pressSequentially("163456");
  await expect(phone).toHaveValue("(16) 3456");
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByRole("alert")).toContainText("Informe o DDD");
  await phone.press("End");
  await phone.pressSequentially("7890");
  await expect(phone).toHaveValue("(16) 3456-7890");
  await phone.pressSequentially("1");
  await expect(phone).toHaveValue("(16) 34567-8901");
  await phone.pressSequentially("2A");
  await expect(phone).toHaveValue("(16) 34567-8901");
  await phone.fill("+55 (11) 99999-0000");
  await expect(phone).toHaveValue("(11) 99999-0000");
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByRole("alert")).toHaveText("Tente novamente.");
  await expect(page).toHaveURL(/etapa=contato/);
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível confirmar o cadastro");
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByText("Recebemos seu cadastro.")).toBeVisible();
  expect(await commands()).toEqual([
    ["set", "autoConfig", "false", pixelId],
    ["init", pixelId],
    ["trackSingle", pixelId, "PageView"],
    ["trackSingle", pixelId, "Contact"],
    ["trackSingleCustom", pixelId, "EscolheuTurno"],
    ["trackSingleCustom", pixelId, "VoltouDaManha"],
    ["trackSingle", pixelId, "Lead", {}, { eventID: key }],
    ["trackSingle", pixelId, "CompleteRegistration"],
  ]);
  await expect(page).toHaveURL(/etapa=concluido&acao=avancar-contato/);
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("meta");
  await expect(
    page.getByRole("heading", { name: "Cadastro concluído" }),
  ).toBeVisible();
});

test("envia apenas o evento de navegação quando PageView e Lead estão desativados", async ({ page }) => {
  const form = makePersistedPathForm("snapshot");
  const version = form.versions[0];
  const settings = settingsOf(version.settings);
  version.settings = settings;
  settings.tracking = { ...settings.tracking, pixelId: "1234567890", pageView: false, lead: false, trackStageUrls: true };
  version.steps = [version.steps[0]];
  for (const key of ["name", "email", "phone"] as const) {
    settings.contacts[key] = { ...settings.contacts[key], enabled: false };
  }
  await page.addInitScript((fixture) => {
    localStorage.setItem("public-test-form", JSON.stringify(fixture));
  }, { ...form, clinicName: "Clínica" });
  await page.route("https://connect.facebook.net/en_US/fbevents.js", (route) => route.abort());
  const internal: string[] = [];
  await page.route("**/api/public/forms/*", (route) => {
    const body = route.request().postDataJSON();
    internal.push(body.eventType ?? "capture");
    return route.fulfill({ json: { ok: true, complete: true, leadId: crypto.randomUUID() } });
  });
  await page.clock.install();
  await page.goto("/tests/editor-harness/index.html?public-form");
  await expect(page.getByRole("radio", { name: "Manhã" })).toBeVisible();
  await page.clock.runFor(10_250);
  await page.getByRole("radio", { name: "Manhã" }).check();
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Cadastro concluído" })).toBeVisible();
  expect(internal).toContain("view");
  expect(internal).toContain("capture");
  expect(await page.evaluate(() => window.fbq?.queue)).toEqual([
    ["set", "autoConfig", "false", settings.tracking.pixelId], ["init", settings.tracking.pixelId],
    ["trackSingleCustom", settings.tracking.pixelId, "EtapaFormulario"],
  ]);
});

test("duplicar na lista reabre a mesma cópia após uma resposta perdida", async ({ page }) => {
  const source = makePersistedPathForm("snapshot");
  await seedPersistedForm(page, source);
  let copyId = "";
  let attempts = 0;
  await page.route(`**/api/forms/${source.id}`, (route) => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe("duplicate");
    if (++attempts === 1) {
      copyId = body.copyId;
      return route.abort();
    }
    expect(body.copyId).toBe(copyId);
    return route.fulfill({json: {id: copyId}});
  });
  await page.route("**/formularios/*/editar", (route) => route.fulfill({contentType: "text/html", body: "<main>Editor</main>"}));
  await page.goto("/tests/editor-harness/index.html?list");
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/app/clientes/${source.clientId}/formularios/${copyId}/editar`);
});

test("editor mantém os eventos da apresentação e de retorno ao editar uma publicação", async ({ page }) => {
  const source = makePersistedPathForm("snapshot");
  const v = source.versions[0];
  v.settings = settingsOf(v.settings);
  v.settings.introduction.mode = "separate";
  v.settings.contacts = { ...v.settings.contacts, name: { ...v.settings.contacts.name, enabled: true } };
  await page.addInitScript((value) => {
    if (!localStorage.getItem("editor-test-draft")) localStorage.setItem("editor-test-draft", JSON.stringify(value));
  }, source);
  await page.goto("/tests/editor-harness/index.html");
  const events = page.getByRole("button", {name: /07 Eventos e integrações/});
  await events.click();
  const start = page.getByRole("combobox", {name: v.settings.introduction.buttonLabel, exact:true});
  await start.fill("Contact");
  const section = page.getByRole("group", {name:"Dados de contato", exact:true});
  await section.getByRole("combobox", {name:"Voltar",exact:true}).fill("RetornarPergunta");
  await page.getByRole("checkbox", {name:/Enviar EtapaFormulario/}).check();
  await page.getByRole("button", {name:"Salvar rascunho",exact:true}).click();
  await expect(page.locator(".notice")).toContainText("salvo");
  await page.reload();
  await events.click();
  await expect(start).toHaveValue("Contact");
  await expect(section.getByRole("combobox", {name:"Voltar",exact:true})).toHaveValue("RetornarPergunta");
  await expect(page.getByRole("checkbox", {name:/Enviar EtapaFormulario/})).toBeChecked();
  await expect(page.getByText(`acao=avancar-pergunta-${v.steps[0].id}`, {exact:true})).toBeVisible();
});
