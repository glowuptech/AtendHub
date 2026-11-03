import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("fila geral agrega clientes, atribui e move preservando contexto", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.goto("/app/fila");
  await expect(
    page.getByRole("navigation", { name: "Sistema", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pessoa Exemplo Alfa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pessoa Exemplo Delta" }),
  ).toBeVisible();
  await page
    .getByLabel("Clínica em contexto")
    .selectOption("00000000-0000-4000-8000-000000000020");
  await expect(
    page.getByRole("heading", { name: "Pessoa Exemplo Alfa" }),
  ).toBeVisible();
  await expect(page.getByText(/Atraso /).first()).toBeVisible();
  await page.screenshot({
    path: "test-results/queue-kanban.png",
    fullPage: true,
  });
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Pessoa Exemplo Alfa" }),
  });
  await card.getByRole("button", { name: "Assumir atendimento" }).click();
  await expect(card).toContainText("Responsável:");
  await card
    .getByRole("combobox", { name: /Mover Pessoa/ })
    .selectOption("waiting");
  await expect(
    page
      .getByRole("region", { name: "Aguardando resposta" })
      .locator("article"),
  ).toContainText("Pessoa Exemplo Alfa");
  await card.getByRole("button", { name: "Abrir lead" }).click();
  await expect(
    page.getByRole("heading", { name: "Pessoa Exemplo Alfa" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Fila de atendimento" }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
