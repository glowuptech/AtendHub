import { test, expect } from "@playwright/test";
test("lead atribuído aparece sem mensagem e permite escolher a linha para iniciar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/tests/editor-harness/index.html?inbox");
  await expect(
    page.getByRole("button", { name: /Adriele.*Pronto para iniciar/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Adriele.*Pronto para iniciar/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir conversa", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Número comercial").selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Abrir conversa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem registrada" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Escreva uma mensagem…")).toBeEnabled();
  await expect(
    page.getByText("Pronto para iniciar · Sem mensagens"),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem registrada" }),
  ).toBeVisible();
});
