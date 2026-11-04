import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("login da equipe sem autocadastro nem envio de credenciais", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: /Criar conta|cadastro/i }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("e-mail");
  await page.getByLabel("E-mail", { exact: true }).fill("equipe@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nenhuma credencial foi enviada",
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: "test-results/login-desktop.png" });
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
  await page.goto("/cadastro");
  await expect(
    page.getByRole("button", { name: "Criar conta", exact: true }),
  ).toHaveCount(0);
});
