import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("navegação recolhível, menu mobile e teclado preservam destinos", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Recolher navegação" }).click();
  await expect(page.locator(".shell")).toHaveClass(/is-collapsed/);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("link", { name: "Fila de atendimento", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/fila$/);
  await page.getByRole("button", { name: "Expandir navegação" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Alternar navegação" }).click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("link", { name: "Conhecer portal" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Alternar navegação" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Alternar navegação" }).click();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/configuracoes$/);
  await expect(page.locator(".sidebar")).not.toBeVisible();
});

test("telas principais mantêm contraste e largura em desktop, tablet e celular", async ({
  page,
}) => {
  test.setTimeout(120000);
  const client = "00000000-0000-4000-8000-000000000010";
  const screens = [
    ["overview", "/app"],
    ["system", "/app/sistema"],
    ["queue", "/app/fila"],
    ["clients", "/app/clientes"],
    ["profile", `/app/clientes/${client}`],
    ["editor", `/app/clientes/${client}/formularios/novo`],
    ["inbox", "/app/inbox"],
    ["leads", "/app/leads"],
    ["settings", "/app/configuracoes"],
    ["appointments", "/app/agendamentos"],
    ["portal", "/portal"],
    ["login", "/login"],
  ];
  for (const [name, path] of screens) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      name,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/redesign-${name}.png` });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} ${width}`,
      ).toBe(true);
    }
    await page.screenshot({ path: `test-results/redesign-${name}-mobile.png` });
  }
});
