import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("calendário geral mostra clientes, etapas e hoje sem depender do workspace", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-04T15:00:00Z"));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/app");
  await page
    .getByLabel("Clínica em contexto")
    .selectOption("00000000-0000-4000-8000-000000000020");
  await page.getByRole("link", { name: "Calendário", exact: true }).click();
  await expect(page.locator(".system-calendar-day")).toHaveCount(7);
  await expect(
    page.locator(".system-calendar-day[data-today=true]"),
  ).toHaveAttribute("aria-current", "date");
  await expect(page.locator(".system-calendar-week")).toContainText(
    "Clínica Ana Luiza",
  );
  await expect(page.locator(".system-calendar-week")).toContainText(
    "Clínica Horizonte",
  );
  const card = page
    .locator(".system-appointment-card")
    .filter({ hasText: "Pessoa Exemplo Delta" });
  await card.click();
  const dialog = page.getByRole("dialog", {
    name: "Agendamento do calendário",
  });
  await dialog
    .getByRole("combobox", { name: /^Confirmação/ })
    .selectOption("confirmed");
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Confirmado");
  await page
    .getByRole("combobox", { name: /^Etapa do agendamento/ })
    .selectOption("confirmed");
  await expect(page.locator(".system-appointment-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: /^Etapa do agendamento/ })
    .selectOption("all");
  await page.screenshot({ path: "test-results/system-calendar-desktop.png" });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Próximo", exact: true }).click();
  await expect(page.locator(".system-appointment-card")).toHaveCount(0);
  await expect(
    page.locator(".system-calendar-day[data-today=true]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Esta semana", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/system-calendar-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Agendamentos", exact: true }).click();
  await expect(
    page.locator(".schedule-day-heading[data-today=true]"),
  ).toHaveAttribute("aria-current", "date");
  await expect(
    page.locator(".schedule-day-heading[data-today=true]"),
  ).toContainText("Hoje");
  await expect(page.locator(".schedule-grid")).toHaveAttribute(
    "data-has-today",
    "true",
  );
  await page.screenshot({ path: "test-results/workspace-today.png" });
});
