import { test, expect } from "@playwright/test";
// Opt in only on a development Supabase with an authorized browser session.
const clientId = process.env.ATENDHUB_E2E_CLIENT_ID;
const sessionFile = process.env.ATENDHUB_E2E_STORAGE_STATE;
test.use({ storageState: sessionFile });
test("persiste o fluxo centralizado no Supabase autenticado", async ({
  page,
}) => {
  test.skip(
    !clientId || !sessionFile,
    "Defina cliente de desenvolvimento e storageState autenticado. O harness isolado não comprova RLS.",
  );
  await page.goto(`/app/clientes/${clientId}/formularios/novo`);
  await page.getByRole("button", { name: "Geral", exact: true }).click();
  await page
    .getByLabel("Nome do formulário", { exact: true })
    .fill("Teste de integração do editor");
  await page
    .getByLabel("Slug", { exact: true })
    .fill(`teste-editor-${Date.now()}`);
  await page.getByRole("button", { name: "Perguntas", exact: true }).click();
  await page
    .getByLabel("Nome do campo", { exact: true })
    .fill("Qual atendimento?");
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("image_choice");
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .locator(".question-option-editor")
    .nth(0)
    .getByLabel("Título", { exact: true })
    .fill("Ginecológica");
  await page
    .locator(".question-option-editor")
    .nth(1)
    .getByLabel("Título", { exact: true })
    .fill("Obstétrica");
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await page
    .getByRole("combobox", {
      name: "Pergunta que escolhe o atendimento",
      exact: true,
    })
    .selectOption({ label: "Qual atendimento?" });
  await page
    .getByRole("button", { name: "Adicionar caminho", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar caminho", exact: true })
    .click();
  const a = await page
    .getByLabel("Destino de Ginecológica")
    .locator("option")
    .nth(1)
    .getAttribute("value");
  const b = await page
    .getByLabel("Destino de Obstétrica")
    .locator("option")
    .nth(2)
    .getAttribute("value");
  await page.getByLabel("Destino de Ginecológica").selectOption(a!);
  await page.getByLabel("Destino de Obstétrica").selectOption(b!);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/forms") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const form = await response.json();
  await page.goto(`/app/clientes/${clientId}/formularios/${form.id}/editar`);
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await expect(page.getByLabel("Destino de Ginecológica")).toHaveValue(a!);
  await expect(page.getByLabel("Destino de Obstétrica")).toHaveValue(b!);
});
