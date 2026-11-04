import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const client = "00000000-0000-4000-8000-000000000010";
test("dashboard geral filtra, gerencia investimento e mantém custos honestos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/sistema");
  await page.getByLabel("De", { exact: true }).fill("2026-11-03");
  await page.getByLabel("Até", { exact: true }).fill("2026-11-03");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await page
    .locator(".system-filters")
    .getByRole("combobox")
    .last()
    .selectOption(client);
  const cpl = page.locator(".system-kpis .card").filter({
    has: page.getByRole("heading", {
      name: "Custo por lead geral",
      exact: true,
    }),
  });
  await expect(cpl).toContainText("Não disponível");
  await page
    .getByText("Gerenciar investimentos de tráfego pago", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Cliente do investimento/ })
    .selectOption(client);
  await page.getByLabel("Data do investimento").fill("2026-11-03");
  await page.getByLabel("Valor investido (R$)", { exact: true }).fill("100,00");
  await page.getByLabel("Observação / fonte").fill("Tráfego pago");
  await page
    .getByRole("button", { name: "Salvar investimento", exact: true })
    .click();
  await expect(cpl).toContainText(/R\$\s*50,00/);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Valor investido (R$)", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Salvar investimento", exact: true })
    .click();
  await expect(cpl).toContainText(/R\$\s*0,00/);
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(cpl).toContainText("Não disponível");
  await page
    .locator(".system-filters")
    .getByRole("combobox")
    .first()
    .selectOption("legal");
  await expect(page.getByText("Nenhum cliente neste filtro.")).toBeVisible();
  await page
    .locator(".system-filters")
    .getByRole("combobox")
    .first()
    .selectOption("all");
  await page.getByLabel("De", { exact: true }).fill("2026-11-04");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText("data inicial");
  await page.getByLabel("De", { exact: true }).fill("2026-11-03");
  await page
    .getByRole("button", { name: "Aplicar período", exact: true })
    .click();
  await page
    .getByText("Gerenciar investimentos de tráfego pago", { exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/system-dashboard.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar relatório" }).click();
  expect((await download).suggestedFilename()).toContain("atend-hub");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/system-dashboard-mobile.png",
    fullPage: true,
  });
});
