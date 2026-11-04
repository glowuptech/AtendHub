import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("seleção pesquisável filtra histórico, preserva escolha e funciona no celular", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-04T15:00:00Z"));
  await page.goto("/app/agendamentos");
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar agendamento",
    exact: true,
  });
  await dialog.getByRole("textbox", { name: "Buscar lead" }).fill("alfa");
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await dialog
    .getByRole("radio", { name: "Pessoa Exemplo Alfa", exact: true })
    .check();
  await dialog.getByRole("textbox", { name: "Buscar lead" }).fill("Gama");
  await expect(dialog.getByText(/A seleção foi mantida/)).toBeVisible();
  await dialog
    .getByRole("combobox", { name: /^Filtrar leads/ })
    .selectOption("unbooked");
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Limpar busca e filtros" }).click();
  await expect(
    dialog.getByRole("radio", { name: "Pessoa Exemplo Alfa", exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("combobox", { name: /^Filtrar leads/ })
    .selectOption("recent7");
  await expect(dialog.getByRole("radio").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/booking-lead-picker.png" });
});
