import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("rotinas por cliente, canais, tempos e regras globais sem envios externos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/follow-up");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Intervalo após a última mensagem" }),
  ).toHaveValue("6");
  await page
    .getByRole("spinbutton", { name: "Intervalo após a última mensagem" })
    .fill("2");
  await expect(
    page.getByRole("combobox", { name: /^Unidade de tempo/ }),
  ).toHaveValue("hours");
  await page
    .getByRole("textbox", { name: "Mensagem WhatsApp", exact: true })
    .fill("Olá, {nome}. Podemos continuar seu atendimento?");
  await page
    .getByRole("checkbox", { name: "Habilitar esta rotina", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar rotina", exact: true })
    .click();
  await expect(
    page.getByText("Rotina salva para este cliente. Programação revalidada.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Confirmações e lembretes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "SMS", exact: true }).check();
  await page
    .getByRole("textbox", { name: "Mensagem WhatsApp", exact: true })
    .fill("Olá, {nome}. Confirma sua consulta em {data} às {horario}?");
  await page
    .getByRole("textbox", { name: "Mensagem SMS", exact: true })
    .fill("Confirmação: {data}, {horario}.");
  await page
    .getByRole("checkbox", { name: "Habilitar esta rotina", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar rotina", exact: true })
    .click();
  await expect(
    page.getByText("Rotina salva para este cliente. Programação revalidada.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Follow-up", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Intervalo após a última mensagem" }),
  ).toHaveValue("2");
  await page.screenshot({ path: "test-results/followup-desktop.png" });
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await page
    .getByLabel("Clínica em contexto")
    .selectOption("00000000-0000-4000-8000-000000000020");
  await page.getByRole("link", { name: "Follow-up", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Habilitar esta rotina", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Mensagem WhatsApp", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Automações", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Agendamento criado → Agendado/ })
    .check();
  await page
    .getByRole("button", { name: "Salvar regras", exact: true })
    .click();
  await expect(
    page.getByText("Regras salvas. Eventos anteriores não são reaplicados.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/automations-system.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/automations-mobile.png" });
});
test("regra habilitada move o lead ao criar agendamento pela interface", async ({
  page,
}) => {
  await page.goto("/app/automacoes");
  await page
    .getByRole("checkbox", { name: /Agendamento criado → Agendado/ })
    .check();
  await page
    .getByRole("button", { name: "Salvar regras", exact: true })
    .click();
  await page.getByRole("link", { name: "Agendamentos", exact: true }).click();
  await page.getByLabel("Semana de").fill("2026-11-09");
  await page
    .getByRole("button", { name: "Configurar disponibilidade" })
    .click();
  await page.getByLabel("Início", { exact: true }).fill("08:00");
  await page.getByLabel("Fim", { exact: true }).fill("10:00");
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
  await dialog
    .getByRole("radio", { name: "Pessoa Exemplo Beta", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Salvar agendamento" }).click();
  await page
    .getByRole("link", { name: "Fila de atendimento", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Agendado", exact: true }),
  ).toContainText("Pessoa Exemplo Beta");
});
