import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const a = "00000000-0000-4000-8000-000000000010";
test("perfil: indicadores, datas, edição, contrato e cancelamento", async ({
  page,
}) => {
  await page.goto(`/app/clientes/${a}`);
  await expect(
    page.getByRole("heading", { name: "Parceria e contrato" }),
  ).toBeVisible();
  await expect(page.getByText("33 dias", { exact: true })).toBeVisible();
  await expect(page.getByText("Em 25 dias", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: /^Profissional/ })
    .selectOption("00000000-0000-4000-8000-000000000041");
  await expect(
    page.getByText("38 envios / 100 sessões fictícias", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("De", { exact: true }).fill("2026-11-03");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(
    page.getByText("17 envios / 40 sessões fictícias", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("De", { exact: true }).fill("2026-11-04");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("inicial");
  await page
    .getByRole("button", { name: "Últimos 30 dias", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Profissional/ })
    .selectOption("all");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/client-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Contato administrativo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Desempenho da clínica" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar informações", exact: true })
    .click();
  await page
    .getByLabel("Nome da clínica ou profissional", { exact: true })
    .fill("Clínica Editada DEMO");
  await page.getByLabel("Cidade", { exact: true }).fill("Cidade Atualizada");
  await page
    .getByLabel("Data de assinatura do contrato", { exact: true })
    .fill("");
  await page
    .getByLabel("Prazo para assinatura", { exact: true })
    .fill("2026-11-01");
  await page
    .getByLabel("Próxima renovação do contrato", { exact: true })
    .fill("2026-09-01");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("renovação");
  await page
    .getByLabel("Próxima renovação do contrato", { exact: true })
    .fill("2026-11-20");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("atualizadas");
  await expect(
    page.getByRole("heading", { name: "Clínica Editada DEMO", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cidade Atualizada", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar informações", exact: true })
    .click();
  await page.getByLabel("Cidade", { exact: true }).fill("Não salvar");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByText("Cidade Atualizada", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/client-information.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(
    page.getByText("Assinatura atrasada há 2 dias", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Em 17 dias", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/client-overview-mobile.png",
    fullPage: true,
  });
});
