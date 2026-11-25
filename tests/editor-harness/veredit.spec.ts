import { test, expect } from "@playwright/test";

test("cadastra escritório Veredit com OAB e UF e mantém a carteira de Saúde", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?veredit");
  await page
    .getByRole("button", { name: "Criar cliente", exact: true })
    .click();
  const registration = page.getByRole("dialog");
  await registration.getByLabel("Operação").selectOption("legal");
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
      .getByText("Glow Up", { exact: true })
      .first(),
  ).toBeVisible();
});

test("cria perfis de Organização para Glow Up e Veredit sem registro profissional", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?veredit");
  for (const [vertical, brand] of [
    ["healthcare", "Glow Up"],
    ["legal", "Veredit"],
  ]) {
    await page
      .getByRole("button", { name: "Criar cliente", exact: true })
      .click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Categoria").selectOption("organization");
    await form.getByLabel("Operação").selectOption(vertical);
    await expect(form.getByLabel("Categoria")).toHaveValue("organization");
    await form.getByLabel("Nome da organização").fill(`Captação ${brand}`);
    if (vertical === "healthcare") {
      await form
        .getByRole("button", { name: "Adicionar profissional", exact: true })
        .click();
      await form.getByLabel("Nome do profissional").fill("Pessoa comercial");
      await expect(form.getByLabel(/Número do CRM|Número da OAB/)).toHaveCount(
        0,
      );
    }
    await form
      .getByRole("button", { name: "Criar cliente", exact: true })
      .click();
    const card = page
      .locator(".clinic-directory-card")
      .filter({ hasText: `Captação ${brand}` });
    await expect(card.getByText("Organização", { exact: true })).toBeVisible();
    await expect(card.getByText(brand, { exact: true })).toBeVisible();
  }
});

test("permite reclassificar o perfil existente como Organização", async ({
  page,
}) => {
  await page.route("**/api/clients/*", async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.continue();
    const client = request.postDataJSON();
    expect(client.category).toBe("organization");
    expect(client.vertical).toBe("healthcare");
    expect(client.doctors.length).toBeGreaterThan(0);
    return route.fulfill({ json: client });
  });
  await page.goto("/tests/editor-harness/index.html?client-profile");
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await page.getByRole("button", { name: "Editar informações" }).click();
  await page.getByLabel("Categoria").selectOption("organization");
  await expect(page.getByLabel("Nome da organização")).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "salvos no Supabase" }),
  ).toBeVisible();
});
