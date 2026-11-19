import { test, expect, type Page } from "@playwright/test";
const a = "00000000-0000-4000-8000-000000000001";
const card = (page: Page, name: string) =>
  page
    .locator("section.card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function open(page: Page, suffix = "") {
  await page.clock.setFixedTime(new Date("2026-11-03T15:00:00Z"));
  await page.goto("/tests/editor-harness/index.html?dashboard" + suffix);
}
test("dashboard usa a fonte autenticada, filtra os dados e exporta os agregados exibidos", async ({
  page,
}) => {
  await open(page);
  await expect(card(page, "Leads recebidos").locator("strong")).toHaveText("3");
  await expect(card(page, "Clientes cadastrados").locator("strong")).toHaveText(
    "2",
  );
  await expect(
    card(page, "Conversão em agendamento").locator("strong"),
  ).toHaveText("33,3%");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(a);
  await expect(card(page, "Leads recebidos").locator("strong")).toHaveText("2");
  await expect(
    card(page, "Conversão em agendamento").locator("strong"),
  ).toHaveText("50%");
  await page.getByLabel("De", { exact: true }).fill("2026-11-04");
  await page.getByLabel("Até", { exact: true }).fill("2026-11-04");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await expect(card(page, "Leads recebidos").locator("strong")).toHaveText("1");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar relatório" }).click();
  expect((await download).suggestedFilename()).toBe(
    "atend-hub-2026-11-04-2026-11-04.csv",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("investimento salvo substitui o dia, persiste após reload e remoção restaura ausência", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("De", { exact: true }).fill("2026-11-03");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(a);
  await expect(card(page, "Custo por lead geral").locator("strong")).toHaveText(
    "Não disponível",
  );
  await page
    .getByText("Gerenciar investimentos de tráfego pago", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente do investimento", exact: true })
    .selectOption(a);
  await page.getByLabel("Valor investido (R$)").fill("100,00");
  await page
    .getByRole("button", { name: "Salvar investimento", exact: true })
    .click();
  await expect(page.getByText("Investimento salvo no banco.")).toBeVisible();
  await expect(
    card(page, "Custo por lead geral").locator("strong"),
  ).toContainText("50,00");
  await page.getByLabel("Valor investido (R$)").fill("0,00");
  await page
    .getByRole("button", { name: "Salvar investimento", exact: true })
    .click();
  await expect(
    card(page, "Custo por lead geral").locator("strong"),
  ).toContainText("0,00");
  await page.reload();
  // Filters are intentionally local; select the same cohort again after reload.
  await page.getByLabel("De", { exact: true }).fill("2026-11-03");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(a);
  await expect(
    card(page, "Custo por lead geral").locator("strong"),
  ).toContainText("0,00");
  await page
    .getByText("Gerenciar investimentos de tráfego pago", { exact: true })
    .click();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(card(page, "Custo por lead geral").locator("strong")).toHaveText(
    "Não disponível",
  );
});
test("falha de leitura não vira métricas zeradas e investimento não ativado não simula salvamento", async ({
  page,
}) => {
  await open(page, "&dashboard-error");
  await expect(page.getByText(/Nenhum zero foi presumido/)).toBeVisible();
  await expect(card(page, "Leads recebidos")).toHaveCount(0);
  await open(page, "&no-investments");
  await expect(card(page, "Leads recebidos").locator("strong")).toHaveText("3");
  await page
    .getByText("Gerenciar investimentos de tráfego pago", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar investimento", exact: true }),
  ).toBeDisabled();
});
