import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("agenda semanal configura médico, cria reserva, impede sobreposição e separa semana", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/agendamentos");
  await page.getByLabel("Semana de").fill("2026-11-09");
  await page
    .getByRole("button", { name: "Configurar disponibilidade" })
    .click();
  await page.getByLabel("Duração padrão da consulta (minutos)").fill("37");
  await page.getByLabel("Intervalo visual da agenda (minutos)").fill("20");
  await page.getByLabel("Início", { exact: true }).fill("08:00");
  await page.getByLabel("Fim", { exact: true }).fill("12:00");
  await page
    .getByRole("button", { name: "Adicionar intervalo ao dia" })
    .click();
  await page.getByRole("button", { name: "Salvar disponibilidade" }).click();
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar agendamento",
    exact: true,
  });
  await expect(dialog.getByLabel("Duração em minutos")).toHaveValue("37");
  await dialog
    .getByRole("radio", { name: "Pessoa Exemplo Alfa", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("fila em memória");
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  await dialog
    .getByRole("radio", { name: "Pessoa Exemplo Beta", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(dialog.locator("[role=alert]")).toContainText("ocupado");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.screenshot({ path: "test-results/schedule-desktop.png" });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Próxima semana", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configurar disponibilidade" })
    .click();
  await expect(
    page.getByLabel("Duração padrão da consulta (minutos)"),
  ).toHaveValue("37");
  await page.getByRole("button", { name: "Fechar configuração" }).click();
  await page
    .getByRole("button", { name: "Semana anterior", exact: true })
    .click();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("link", { name: "Agendamentos", exact: true }).click();
  await page.getByLabel("Semana de").fill("2026-11-09");
  await expect(
    page.getByRole("button", { name: /Agendado: Pessoa Exemplo Alfa/ }).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/schedule-mobile.png" });
});
