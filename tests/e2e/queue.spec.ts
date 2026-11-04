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
  await expect(page.getByLabel("Clínica em contexto")).toHaveCount(0);
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
  const modal = page.getByRole("dialog", { name: "Pessoa Exemplo Alfa" });
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/\/app\/fila$/);
  await modal.getByRole("button", { name: "Respostas", exact: true }).click();
  await expect(
    modal.getByRole("heading", { name: "Respostas do formulário" }),
  ).toBeVisible();
  await modal.getByRole("button", { name: /^Tarefas/ }).click();
  await modal.getByLabel("Nova tarefa").fill("Retornar contato amanhã");
  await modal.getByRole("button", { name: "Adicionar tarefa" }).click();
  await modal
    .getByRole("checkbox", { name: "Retornar contato amanhã" })
    .check();
  await modal.getByRole("button", { name: "Resumo", exact: true }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200); // Let tab background transitions settle before contrast analysis.
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/lead-modal.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(card.getByRole("button", { name: "Abrir lead" })).toBeFocused();
  await card.getByRole("button", { name: "Conversar", exact: true }).click();
  await expect(page.locator(".thread header strong")).toHaveText(
    "Pessoa Exemplo Alfa",
  );
  await page
    .getByRole("link", { name: "Fila de atendimento", exact: true })
    .click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200); // Let tab background transitions settle before contrast analysis.
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
