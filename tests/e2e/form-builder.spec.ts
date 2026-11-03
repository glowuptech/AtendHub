import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const client = "00000000-0000-4000-8000-000000000010";
test("editor, visualização válida, cadastro parcial, conclusão e respostas no CRM", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/clientes/${client}/formularios/novo`);
  await page
    .getByLabel("Nome do formulário", { exact: true })
    .fill("Contato personalizado");
  await page.getByLabel("Slug", { exact: true }).fill("contato-personalizado");
  await page
    .getByLabel("Descrição do formulário")
    .fill("Conte como podemos ajudar.");
  await page.getByLabel("Posição dos contatos").selectOption("start");
  await page.getByLabel("ID do Meta Pixel (opcional)").fill("123456789");
  await page
    .getByLabel("Nome do campo", { exact: true })
    .fill("Qual horário prefere?");
  await page
    .getByRole("combobox", { name: /^Tipo/ })
    .selectOption("single_select");
  await page.getByLabel("Opções, uma por linha").fill("Manhã\nTarde");
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .getByLabel("Evento Meta desta etapa (opcional)")
    .fill("PreferenciaRegistrada");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/form-editor-new.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Ativar formulário", exact: true })
    .click();
  await expect(
    page.getByText("Formulário ativado nesta sessão.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Abrir formulário ativo", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Como podemos falar com você?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("Preencha Nome");
  await page.getByLabel("Nome *", { exact: true }).fill("Pessoa Cadastro");
  await page.getByLabel("WhatsApp *", { exact: true }).fill("11999998888");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("radio", { name: "Tarde", exact: true }).check();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/form-public-mobile.png",
    fullPage: true,
  });
  await page.waitForTimeout(5200);
  await page
    .getByRole("button", { name: "Enviar cadastro", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cadastro concluído" }),
  ).toBeVisible();
  // Client navigation preserves the in-memory registry; a document reload intentionally clears it.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goBack();
  await page.getByRole("link", { name: "Leads e CRM", exact: true }).click();
  await page.getByRole("link", { name: /Pessoa Cadastro/ }).click();
  await expect(page.getByText("Tarde", { exact: true })).toBeVisible();
  await expect(page.getByText("11999998888", { exact: false })).toBeVisible();
  await expect(
    page.locator(".badge").filter({ hasText: "Cadastro concluído" }),
  ).toBeVisible();
});

test("visualização exige tempo visível e a prévia não conta", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto(`/app/clientes/${client}/formularios`);
  const card = page.locator(".card").filter({
    has: page.getByRole("heading", {
      name: "Ginecologia — agendamento",
      exact: true,
    }),
  });
  await card.getByRole("link", { name: "Prévia", exact: true }).click();
  await page.waitForTimeout(11000);
  await page.goBack();
  await expect(card).toContainText("0 visualizações válidas");
  await card
    .getByRole("link", { name: "Abrir formulário", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    }),
  );
  await page.waitForTimeout(11000);
  await page.goBack();
  await expect(card).toContainText("0 visualizações válidas");
  await card
    .getByRole("link", { name: "Abrir formulário", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    }),
  );
  await page.waitForTimeout(4000);
  await page.goBack();
  await expect(card).toContainText("0 visualizações válidas");
  await card
    .getByRole("link", { name: "Abrir formulário", exact: true })
    .click();
  await page.waitForTimeout(6000);
  await page.goBack();
  await expect(card).toContainText("1 visualizações válidas");
});
