import { test, expect } from "@playwright/test";
test("cadastro vinculado ao cliente, telefone com oito dígitos e confirmação sem falso conectado", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?whatsapp");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ index: 1 });
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

test("retorno da criação mostra QR, expira e permite renovar antes de confirmar", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/tests/editor-harness/index.html?whatsapp&qr");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Nome da instância", { exact: true }).fill("recepcao");
  await page.getByLabel("WhatsApp (DDD e número)").fill("16999994444");
  await page
    .getByRole("button", { name: "Adicionar número", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "QR Code para conectar o WhatsApp" }),
  ).toBeVisible();
  await expect(page.getByText("Conectado", { exact: true })).toHaveCount(0);
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("QR Code expirado. Solicite um novo código."),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR Code para conectar o WhatsApp" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gerar novo QR Code", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "QR Code para conectar o WhatsApp" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar conexão", exact: true })
    .click();
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR Code para conectar o WhatsApp" }),
  ).toHaveCount(0);
});
