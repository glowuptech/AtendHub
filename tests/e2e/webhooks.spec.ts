import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("webhooks valida, salva cinco destinos, descarta e mantém na navegação sem envios", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.com"))
      outbound.push(request.url());
  });
  await page.goto("/app/configuracoes");
  await page.getByRole("tab", { name: "Webhooks", exact: true }).click();
  const inputs = page.locator(".webhook-destination input");
  await expect(inputs).toHaveCount(5);
  await inputs.nth(0).fill("http://example.com/invalid");
  await page.getByRole("button", { name: "Salvar webhooks" }).click();
  await expect(page.locator(".webhook-destination [role=alert]")).toContainText(
    "HTTPS",
  );
  await expect(inputs.nth(0)).toBeFocused();
  for (let i = 0; i < 5; i++)
    await inputs.nth(i).fill(`https://example.com/hook-${i}`);
  await page.getByRole("button", { name: "Salvar webhooks" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nenhum evento foi enviado",
  );
  await expect(
    page.getByText("5 de 5 URLs cadastradas", { exact: true }),
  ).toBeVisible();
  await inputs.nth(3).fill("https://example.com/changed");
  await page.getByRole("button", { name: "Descartar alterações" }).click();
  await expect(inputs.nth(3)).toHaveValue("https://example.com/hook-3");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("tab", { name: "Webhooks", exact: true }).click();
  await expect(inputs.nth(3)).toHaveValue("https://example.com/hook-3");
  await inputs.nth(4).fill("");
  await page.getByRole("button", { name: "Salvar webhooks" }).click();
  await expect(
    page.getByText("4 de 5 URLs cadastradas", { exact: true }),
  ).toBeVisible();
  expect(outbound).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/webhooks-mobile.png" });
});
