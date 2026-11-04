import { test, expect } from "@playwright/test";
test("condições de pagamento editáveis e central de faturas prevista", async ({
  page,
}) => {
  await page.goto("/app/clientes/00000000-0000-4000-8000-000000000010");
  await page.getByRole("button", { name: "Informações", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar informações", exact: true })
    .click();
  await page
    .getByLabel("Mensalidade de referência (R$)", { exact: true })
    .fill("1500,49");
  await page
    .getByRole("combobox", { name: /^Forma de pagamento/ })
    .selectOption("credit_card");
  await page
    .getByRole("combobox", { name: /^Parcelamento no cartão/ })
    .selectOption("12");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  const billing = page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", { name: "Mensalidade e pagamento" }),
    });
  await expect(billing).toContainText(/R\$\s*1\.500,49/);
  await expect(billing).toContainText("Cartão de crédito · 12x");
  await page
    .getByRole("button", { name: "Editar informações", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Forma de pagamento/ })
    .selectOption("monthly_boleto");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(billing).toContainText("Boleto mensal");
  await expect(billing).not.toContainText("12x");
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("tab", { name: /Central de faturas/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Em breve");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Emissão e pagamentos serão conectados",
  );
});
