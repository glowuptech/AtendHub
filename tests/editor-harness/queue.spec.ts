import { test, expect } from "@playwright/test";
test("assumir independe do calendário e atualiza responsável", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?queue");
  const button = page.getByRole("button", {
    name: "Assumir atendimento",
    exact: true,
  });
  await expect(page.getByText(/Usando calendário padrão/)).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page.getByText("Atendimento de Lead de teste assumido e salvo."),
  ).toBeVisible();
  await expect(page.getByText("Ana Atendente", { exact: true })).toBeVisible();
  await expect(button).toHaveCount(0);
});
test("permissão negada é informada e permite nova tentativa", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?queue&denied");
  const button = page.getByRole("button", {
    name: "Assumir atendimento",
    exact: true,
  });
  await button.click();
  await expect(
    page.getByText(
      "Sua conta não tem permissão para assumir este atendimento.",
    ),
  ).toBeVisible();
  await expect(button).toBeEnabled();
});

test("kanban desliza com o mouse nos dois sentidos e preserva ações dos cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/tests/editor-harness/index.html?queue");
  const board = page.getByRole("region", { name: "Kanban de atendimento" });
  const title = board.getByRole("heading", {
    name: "Lead de teste",
    exact: true,
  });
  const cardText = await title.boundingBox();
  expect(cardText).not.toBeNull();
  const x = cardText!.x + cardText!.width - 8;
  const y = cardText!.y + cardText!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Small movements are still clicks, rather than accidental scrolling.
  await page.mouse.move(x - 3, y);
  expect(await board.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.mouse.move(x - 170, y, { steps: 12 });
  await expect(board).toHaveAttribute("data-panning", "true");
  expect(await board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(150);
  await page.mouse.up();
  await expect(board).not.toHaveAttribute("data-panning");
  // The header of the next column remains a safe place to drag back.
  const bounds = (await board.boundingBox())!;
  await page.mouse.move(bounds.x + 100, bounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 290, bounds.y + 25, { steps: 12 });
  await page.mouse.up();
  expect(await board.evaluate((el) => el.scrollLeft)).toBe(0);
  await board
    .getByRole("button", { name: "Assumir atendimento", exact: true })
    .click();
  await expect(
    page.getByText("Atendimento de Lead de teste assumido e salvo."),
  ).toBeVisible();
  const select = board.getByLabel("Mover Lead de teste");
  const selectBounds = (await select.boundingBox())!;
  await page.mouse.move(
    selectBounds.x + selectBounds.width / 2,
    selectBounds.y + 10,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectBounds.x + selectBounds.width / 2 - 70,
    selectBounds.y + 10,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.press("Escape");
  expect(await board.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(board).not.toHaveAttribute("data-panning");
});

test("arraste termina fora do quadro e rolagem por teclado continua disponível", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/tests/editor-harness/index.html?queue");
  const board = page.getByRole("region", { name: "Kanban de atendimento" });
  const bounds = (await board.boundingBox())!;
  await page.mouse.move(bounds.x + 300, bounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(1, bounds.y - 20, { steps: 15 });
  await page.mouse.up();
  await expect(board).not.toHaveAttribute("data-panning");
  const stopped = await board.evaluate((el) => el.scrollLeft);
  expect(stopped).toBeGreaterThan(0);
  await page.mouse.move(bounds.x + 500, bounds.y + 25);
  expect(await board.evaluate((el) => el.scrollLeft)).toBe(stopped);
  await board.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await board.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => board.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
});

test("abre a ficha e volta ao mesmo cartão sem sair da fila", async ({ page }) => {
  await page.goto("/tests/editor-harness/index.html?queue");
  const open = page.getByRole("button", { name: "Abrir lead", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Ficha do lead" });
  await expect(dialog.getByText("Histórico de mensagens", {exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});
