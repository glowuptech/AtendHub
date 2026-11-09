import { test, expect } from "@playwright/test";

const client = "00000000-0000-4000-8000-000000000010";

test("persiste cartões de imagem e recalcula os caminhos A e B", async ({ page }) => {
  await page.goto(`/app/clientes/${client}/formularios/novo`);
  await page.getByLabel("Nome do formulário", { exact: true }).fill("Triagem por especialidade");
  await page.getByLabel("Slug", { exact: true }).fill("triagem-especialidade");
  await page.getByLabel("Nome do campo", { exact: true }).fill("Qual atendimento deseja?");
  await page.getByRole("combobox", { name: /^Tipo/ }).selectOption("image_choice");
  await page.getByRole("button", { name: "Adicionar pergunta", exact: true }).click();
  const options = page.locator(".question-option-editor");
  await page.getByRole("button", { name: "Adicionar opção", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar opção", exact: true }).click();
  await options.nth(0).getByLabel("Título").fill("Ginecológica");
  await options.nth(1).getByLabel("Título").fill("Obstetrícia");
  await options.nth(0).getByLabel("Imagem").setInputFiles({ name: "ginecologia.png", mimeType: "image/png", buffer: Buffer.from("fake-image-a") });
  await options.nth(1).getByLabel("Imagem").setInputFiles({ name: "obstetricia.png", mimeType: "image/png", buffer: Buffer.from("fake-image-b") });
  await options.nth(0).getByLabel("Texto alternativo").fill("Ilustração ginecológica");
  await options.nth(1).getByLabel("Texto alternativo").fill("Ilustração obstétrica");
  await page.getByRole("button", { name: "Aplicar tipo e opções" }).click();
  await page.getByRole("button", { name: "Adicionar caminho", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar caminho", exact: true }).click();
  await page.getByLabel("Nome do caminho").nth(0).fill("Ginecologia");
  await page.getByLabel("Nome do caminho").nth(1).fill("Obstetrícia");
  await options.nth(0).getByLabel("Caminho de destino").selectOption("caminho_a");
  await options.nth(1).getByLabel("Caminho de destino").selectOption("caminho_b");
  await page.getByRole("button", { name: "Aplicar tipo e opções" }).click();
  await page.getByRole("button", { name: /Salvar rascunho/ }).click();
  await page.reload();
  await expect(page.locator(".question-option-editor").nth(0).getByLabel("Texto alternativo")).toHaveValue("Ilustração ginecológica");
  await expect(page.locator(".question-option-editor").nth(0).getByLabel("Caminho de destino")).toHaveValue(/caminho_/);
});
