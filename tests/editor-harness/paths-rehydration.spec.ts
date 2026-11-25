import { test, expect } from "@playwright/test";
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
  let captures = 0;
  await page.route(
    "**/api/public/forms/formulario-publicado",
    async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: form });
      const body = route.request().postDataJSON();
      if (body.eventType) return route.fulfill({ json: { ok: true } });
      expect(body.answers[router.question.id]).toBe(field.options[1].id);
      expect(body.answers).not.toHaveProperty(a.question.id);
      expect(body.answers).not.toHaveProperty(common.question.id);
      captures++;
      return captures === 1
        ? route.fulfill({ status: 409, json: { error: "Tente novamente." } })
        : route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("/tests/editor-harness/index.html?public-form");
  await page.getByRole("radio", { name: "Manhã" }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: a.question.label }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar" }).click();
  await page.getByRole("radio", { name: "Tarde" }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
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
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(
    page.getByRole("heading", { name: "Cadastro concluído" }),
  ).toBeVisible();
});
