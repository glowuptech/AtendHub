import { test, expect } from "@playwright/test";
test("editor conserva opções sem Aplicar e concentra caminhos em Fluxo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tests/editor-harness/index.html");
  await page
    .getByLabel("Nome do campo", { exact: true })
    .fill("Qual atendimento?");
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("image_choice");
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .locator(".question-option-editor")
    .nth(0)
    .getByLabel("Título", { exact: true })
    .fill("Ginecológica");
  await page
    .locator(".question-option-editor")
    .nth(1)
    .getByLabel("Título", { exact: true })
    .fill("Obstétrica");
  await page
    .locator(".question-option-editor")
    .nth(0)
    .getByLabel("Imagem", { exact: true })
    .setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  for (const path of ["A", "B"]) {
    await page
      .getByLabel("Nome do campo", { exact: true })
      .fill(`Pergunta exclusiva ${path}`);
    await page
      .getByRole("combobox", { name: "Tipo", exact: true })
      .selectOption("short_text");
    await page
      .getByRole("button", { name: "Adicionar pergunta", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Aplicar tipo e opções" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Caminho de destino")).toHaveCount(0);
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await page
    .getByRole("combobox", {
      name: "Pergunta que escolhe o atendimento",
      exact: true,
    })
    .selectOption({ label: "Qual atendimento?" });
  await page
    .getByRole("button", { name: "Adicionar caminho", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar caminho", exact: true })
    .click();
  await page
    .getByLabel("Nome do caminho A", { exact: true })
    .fill("Ginecologia");
  await page
    .getByLabel("Nome do caminho B", { exact: true })
    .fill("Obstetrícia");
  const a = await page
    .getByLabel("Destino de Ginecológica")
    .locator("option")
    .nth(1)
    .getAttribute("value");
  const b = await page
    .getByLabel("Destino de Obstétrica")
    .locator("option")
    .nth(2)
    .getAttribute("value");
  await page.getByLabel("Destino de Ginecológica").selectOption(a!);
  await page.getByLabel("Destino de Obstétrica").selectOption(b!);
  await page
    .getByRole("group", { name: "Pergunta exclusiva A", exact: true })
    .getByRole("checkbox", { name: "A — Ginecologia", exact: true })
    .check();
  await page
    .getByRole("group", { name: "Pergunta exclusiva B", exact: true })
    .getByRole("checkbox", { name: "B — Obstetrícia", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await page.reload();
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await expect(page.getByLabel("Destino de Ginecológica")).toHaveValue(a!);
  await expect(page.getByLabel("Destino de Obstétrica")).toHaveValue(b!);
  const preview = page.getByRole("complementary");
  await expect(preview.getByRole("img")).toHaveCount(1);
  await preview.getByRole("radio", { name: /Ginecológica/ }).check();
  await preview.getByRole("button", { name: /Continuar/ }).click();
  await expect(
    preview.getByRole("heading", { name: "Pergunta exclusiva A", exact: true }),
  ).toBeVisible();
  await preview.getByRole("button", { name: /Voltar/ }).click();
  await preview.getByRole("radio", { name: /Obstétrica/ }).check();
  await preview.getByRole("button", { name: /Continuar/ }).click();
  await expect(
    preview.getByRole("heading", { name: "Pergunta exclusiva B", exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Pergunta exclusiva A", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/editor-flow-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/editor-flow-mobile.png" });
});
