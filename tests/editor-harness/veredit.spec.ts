import { test, expect } from "@playwright/test";

test("cadastra escritório Veredit com OAB e UF e mantém a carteira de Saúde", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?veredit");
  await page
    .getByRole("button", { name: "Criar cliente", exact: true })
    .click();
  const registration = page.getByRole("dialog");
  await registration.getByLabel("Tipo de cliente").selectOption("legal");
  await expect(registration.getByLabel("Categoria")).toHaveValue("law_firm");
  await registration
    .getByLabel("Nome do escritório ou profissional")
    .fill("Escritório de teste");
  await registration
    .getByRole("button", { name: "Adicionar advogado(a)", exact: true })
    .click();
  await registration.getByLabel("Nome do advogado(a)").fill("Ana Advogada");
  await registration.getByLabel("Número da OAB").fill("123456-A");
  await registration.getByLabel("UF da OAB").selectOption("MG");
  await registration
    .getByRole("button", { name: "Criar cliente", exact: true })
    .click();
  const card = page
    .locator(".clinic-directory-card")
    .filter({ hasText: "Escritório de teste" });
  await expect(card.getByText("Veredit", { exact: true })).toBeVisible();
  await expect(
    card.getByText("OAB/MG 123456-A", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".clinic-directory-card")
      .getByText("Prescrita", { exact: true })
      .first(),
  ).toBeVisible();
});
