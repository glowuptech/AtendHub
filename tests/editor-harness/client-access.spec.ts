import { test, expect } from "@playwright/test";
test("agenda real e acessos com revelação explícita de senha", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?client-access");
  await page
    .getByLabel("Nome da plataforma", { exact: true })
    .fill("Agenda teste");
  await page
    .getByLabel("URL de agendamento", { exact: true })
    .fill("https://agenda.example/consulta");
  await page
    .getByRole("button", { name: "Salvar plataforma", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Abrir Agenda teste", exact: true }),
  ).toHaveAttribute("href", "https://agenda.example/consulta");
  await page
    .getByRole("button", { name: "Adicionar acesso", exact: true })
    .click();
  await page.getByLabel("Plataforma", { exact: true }).fill("Recepção");
  await page
    .getByLabel("Login ou e-mail", { exact: true })
    .fill("teste@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page
    .getByRole("button", { name: "Salvar acesso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recepção", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("senha-de-teste", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Abrir Agenda teste", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recepção", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revelar senha", exact: true })
    .click();
  await expect(page.getByText("senha-de-teste", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ocultar senha", exact: true })
    .click();
  await expect(page.getByText("senha-de-teste", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByLabel("Nova senha (deixe em branco para manter)"),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recepção", exact: true }),
  ).toHaveCount(0);
});
