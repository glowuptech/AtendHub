import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("diretório: copiar dados, filtrar, criar e abrir perfil", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/app/clientes");
  await page
    .getByRole("button", {
      name: "Copiar CNPJ de Clínica Ana Luiza — DEMO",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "00.000.000/0000-00",
  );
  await page
    .getByRole("button", {
      name: "Copiar CRM de Dra. Exemplo Alfa — DEMO",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "CRM/SP 000000",
  );
  await expect(
    page.getByRole("button", {
      name: "Copiar CRM de Dra. Exemplo Gama — DEMO",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Buscar clínica ou profissional").fill("obstetricia");
  await expect(
    page.getByRole("heading", {
      name: "Clínica Horizonte — DEMO",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page
    .locator("#clinic-extra-filters")
    .getByRole("combobox", { name: /^Categoria/ })
    .selectOption("doctor_female");
  await expect(
    page.getByRole("heading", {
      name: "Clínica Ana Luiza — DEMO",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/clinics-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Criar clínica", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Criar clínica · DEMO" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog
    .getByLabel("Nome da clínica ou profissional")
    .fill("Clínica Teste DEMO");
  await dialog
    .getByLabel("Especialidades (separadas por vírgula)")
    .fill("Cardiologia");
  await dialog.getByRole("button", { name: "Adicionar médico" }).click();
  await dialog.getByLabel("Nome do médico").fill("Dra. Teste DEMO");
  await dialog.getByLabel("Número do CRM").fill("000002");
  await dialog.getByLabel("UF do CRM").selectOption("MG");
  await dialog.getByLabel(/^Logotipo/).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  // Allow file decode; creation does not depend on asynchronous uploads to a server.
  await expect(
    dialog.getByRole("button", { name: "Remover", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Criar clínica · DEMO" }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator(".clinic-directory-card").filter({
    has: page.getByRole("heading", {
      name: "Clínica Teste DEMO",
      exact: true,
    }),
  });
  await expect(card.getByText("CRM/MG 000002", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "Acessar perfil" }).click();
  await expect(
    page.getByRole("heading", { name: "Clínica Teste DEMO", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clínicas", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/clinics-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Criar clínica", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
