import { test, expect } from "@playwright/test";
test("cadastro vinculado ao cliente, telefone com oito dígitos e confirmação sem falso conectado", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?whatsapp");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Nome da instância", { exact: true }).fill("recepcao");
  await page.getByLabel("WhatsApp (DDD e número)").fill("1633334444");
  await expect(page.getByLabel("WhatsApp (DDD e número)")).toHaveValue(
    "(16) 3333-4444",
  );
  await page
    .getByRole("button", { name: "Adicionar número", exact: true })
    .click();
  await expect(
    page.getByText("Aguardando conexão", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "cliente-recepcao" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar conexão", exact: true })
    .click();
  await expect(
    page.getByText("Confirmação solicitada", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Conectado", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Excluir conexão", exact: true })
    .click();
  await expect(
    page.getByText("Exclusão solicitada", { exact: true }),
  ).toBeVisible();
});
