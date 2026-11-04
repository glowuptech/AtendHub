import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("calendário nas configurações persiste na navegação e sai da fila", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/configuracoes");
  const tabs = page.getByRole("tablist", { name: "Seções de configurações" });
  await expect(tabs.getByRole("tab")).toHaveCount(9);
  await tabs
    .getByRole("tab", { name: "Calendário de atendimento", exact: true })
    .click();
  await page.getByLabel("Início do expediente").fill("18:00");
  await page.getByRole("button", { name: "Salvar calendário" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("posterior");
  await page.getByLabel("Início do expediente").fill("08:00");
  await page.getByLabel("Fim do expediente").fill("16:00");
  await page.getByLabel("Sábado", { exact: true }).check();
  await page
    .getByRole("textbox", { name: /^Feriados e exceções/ })
    .fill("2026-12-25\n");
  await page.getByRole("button", { name: "Salvar calendário" }).click();
  await expect(page.getByRole("status")).toContainText("Calendário salvo");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/settings-calendar.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Fila de atendimento", exact: true })
    .click();
  await expect(page.getByLabel("Início do expediente")).toHaveCount(0);
  await expect(
    page.getByText("Prazo para assumir: 10 minutos úteis"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await tabs
    .getByRole("tab", { name: "Calendário de atendimento", exact: true })
    .click();
  await expect(page.getByLabel("Início do expediente")).toHaveValue("08:00");
  await expect(page.getByLabel("Sábado", { exact: true })).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: /^Feriados e exceções/ }),
  ).toHaveValue("2026-12-25");
  await tabs.getByRole("tab", { name: /Conexão WhatsApp/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Em breve");
  await tabs.getByRole("tab", { name: /Conexão WhatsApp/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(tabs.getByRole("tab", { name: /Webhooks/ })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: /Webhooks/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs
    .getByRole("tab", { name: "Calendário de atendimento", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/settings-calendar-mobile.png",
    fullPage: true,
  });
});
