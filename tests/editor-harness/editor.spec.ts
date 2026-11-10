import { test, expect } from "@playwright/test";
test("editor conserva opções sem Aplicar e concentra caminhos em Fluxo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tests/editor-harness/index.html");
  await expect(
    page.locator('.form-editor-block-toggle[aria-expanded="false"]'),
  ).toHaveCount(7);
  await page.getByRole("button", { name: /06 Perguntas/ }).click();
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
    .locator("summary")
    .click();
  await page
    .locator(".question-option-editor")
    .nth(0)
    .getByLabel("Título", { exact: true })
    .fill("Ginecológica");
  await page
    .locator(".question-option-editor")
    .nth(1)
    .locator("summary")
    .click();
  await page
    .locator(".question-option-editor")
    .nth(1)
    .getByLabel("Título", { exact: true })
    .fill("Obstétrica");
  await page
    .locator(".question-option-editor")
    .nth(0)
    .locator("summary")
    .click();
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
  await page.getByRole("button", { name: /05 Caminhos/ }).click();
  await page
    .getByRole("combobox", {
      name: "Pergunta que escolhe o atendimento",
      exact: true,
    })
    .selectOption({ label: "Qual atendimento?" });
  await page
    .getByRole("button", {
      name: "Criar caminhos a partir das respostas",
      exact: true,
    })
    .click();
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
  for (const [answer, path] of [
    ["Ginecológica", "A"],
    ["Obstétrica", "B"],
  ]) {
    const branch = page.getByRole("region", {
      name: `Resposta ${answer}`,
      exact: true,
    });
    await branch.locator("summary").click();
    await branch
      .getByRole("checkbox", {
        name: `Pergunta exclusiva ${path}`,
        exact: true,
      })
      .check();
    await expect(branch.locator(".journey-questions")).toContainText(
      `Pergunta exclusiva ${path}`,
    );
  }
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await page.reload();
  await page.getByRole("button", { name: /05 Caminhos/ }).click();
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
  await page
    .locator(".journey-map")
    .screenshot({ path: "test-results/editor-flow-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/editor-flow-mobile.png" });
});

test("aparência funciona antes das perguntas e permanece após salvar", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html");
  const preview = page.getByRole("complementary");
  await expect(preview.locator(".form-experience")).toBeVisible();
  await page.getByRole("button", { name: /04 Aparência/ }).click();
  await page
    .getByLabel("Imagem de fundo opcional")
    .setInputFiles("tests/editor-harness/recognizable-background.png");
  const background = preview.locator(".form-background-layer");
  await expect(page.getByAltText("Prévia da imagem de fundo")).toBeVisible();
  await expect(background).toHaveAttribute(
    "src",
    /^data:image\/(png|webp);base64,/,
  );
  await expect
    .poll(async () =>
      background.evaluate((image) => (image as HTMLImageElement).complete),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      background.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      background.evaluate((image) => (image as HTMLImageElement).naturalHeight),
    )
    .toBeGreaterThan(0);
  await expect(background).toHaveCSS("opacity", "1");
  await expect
    .poll(async () =>
      background.evaluate((image) => image.getBoundingClientRect().width),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      background.evaluate((image) => image.getBoundingClientRect().height),
    )
    .toBeGreaterThan(0);

  async function range(label: string, value: string) {
    await page.getByLabel(label, { exact: false }).evaluate((input, next) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  await range("Fundo do painel", "0");
  await range("Escurecimento da imagem", "0");
  await expect(preview.locator(".form-experience")).toHaveCSS(
    "--form-panel-opacity",
    "0",
  );
  await expect(preview.locator(".form-experience")).toHaveCSS(
    "--form-overlay-opacity",
    "0",
  );
  await page.screenshot({ path: "test-results/appearance-photo-clear.png" });

  await range("Escurecimento da imagem", "30");
  await expect(preview.locator(".form-experience")).toHaveCSS(
    "--form-overlay-opacity",
    "0.3",
  );
  await range("Fundo do painel", "50");
  await expect(preview.locator(".form-experience")).toHaveCSS(
    "--form-panel-opacity",
    "0.5",
  );
  await expect(preview.locator(".form-content, .form-intro").first()).toHaveCSS(
    "opacity",
    "1",
  );

  await page
    .getByLabel("Imagem de fundo opcional")
    .setInputFiles(
      "tests/editor-harness/recognizable-background-replacement.png",
    );
  await expect(background).toHaveAttribute(
    "src",
    /^data:image\/(png|webp);base64,/,
  );
  await expect
    .poll(async () =>
      background.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  // Native color inputs use input/change events; assert the rendered styles, not only state.
  async function color(label: string, value: string) {
    await page.getByLabel(label, { exact: true }).evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  await color("Botão", "#e11d48");
  await expect(page.getByLabel("Botão", { exact: true })).toHaveCSS(
    "height",
    "44px",
  );
  await expect(page.getByText("#E11D48", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/color-picker.png" });
  await color("Texto do botão", "#fef08a");
  await color("Texto", "#16a34a");
  await expect(
    preview.locator(".form-navigation button[type=submit]"),
  ).toHaveCSS("background-color", "rgb(225, 29, 72)");
  await expect(
    preview.locator(".form-navigation button[type=submit]"),
  ).toHaveCSS("color", "rgb(254, 240, 138)");
  await expect(preview.locator(".form-experience h1")).toHaveCSS(
    "color",
    "rgb(22, 163, 74)",
  );
  await page.getByRole("button", { name: /02 Apresentação/ }).click();
  await page
    .getByRole("combobox", { name: "Como apresentar", exact: true })
    .selectOption("separate");
  await page
    .getByLabel("Texto do botão", { exact: true })
    .fill("Começar triagem");
  await expect(preview.locator(".form-intro")).toBeVisible();
  await expect(preview.locator(".form-content")).toHaveCount(0);
  await expect(
    preview.getByRole("button", { name: /Começar triagem/ }),
  ).toHaveCSS("background-color", "rgb(225, 29, 72)");
  await page.getByRole("button", { name: /06 Perguntas/ }).click();
  await page
    .getByLabel("Nome do campo", { exact: true })
    .fill("Pergunta inicial");
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await page.reload();
  const persistedBackground = preview.locator(".form-background-layer");
  await expect(persistedBackground).toBeVisible();
  await expect(persistedBackground).toHaveAttribute(
    "src",
    /^data:image\/(png|webp);base64,/,
  );
  await expect
    .poll(async () =>
      persistedBackground.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    preview.getByRole("button", { name: /Começar triagem/ }),
  ).toHaveCSS("background-color", "rgb(225, 29, 72)");
  await expect(preview.locator(".form-intro h1")).toHaveCSS(
    "color",
    "rgb(22, 163, 74)",
  );
  await page.getByRole("button", { name: /04 Aparência/ }).click();
  await page
    .getByRole("button", { name: "Remover imagem de fundo", exact: true })
    .click();
  await expect(preview.locator(".form-background-layer")).toHaveCount(0);
  await page.screenshot({ path: "test-results/editor-accordion-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/editor-accordion-mobile.png" });
});

test("arquivar pede confirmação e desarquivar recupera como rascunho", async ({
  page,
}) => {
  const { forms } = await import("../../src/lib/mocks/fixtures");
  await page.addInitScript(
    (form) => localStorage.setItem("editor-test-draft", JSON.stringify(form)),
    forms[0],
  );
  await page.goto("/tests/editor-harness/index.html?list");
  const name = forms[0].name;
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Arquivados \(1\)/ }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Desarquivar", exact: true }).click();
  await expect(
    page.getByText(/^Formulário desarquivado como rascunho/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Em uso \(1\)/ }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(
    page.locator(".cards-grid .badge").filter({ hasText: /^Rascunho$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir formulário", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/forms-restored.png" });
});
