import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("sistema, páginas previstas e inbox pessoal de todos os clientes", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Clínica em contexto")
    .selectOption("00000000-0000-4000-8000-000000000020");
  const system = page.getByRole("navigation", { name: "Sistema", exact: true });
  await expect(system.getByRole("link")).toHaveText([
    "Dashboard geral",
    "Fila de atendimento",
    "Clientes",
    "Inbox",
    "Calendário",
    "Tráfego Pago",
    "Configurações",
  ]);
  await system.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByLabel("Clínica em contexto")).toHaveCount(0);
  const list = page.getByRole("region", { name: "Conversas", exact: true });
  await expect(list).toContainText("Pessoa Exemplo Beta");
  await expect(list).toContainText("Pessoa Exemplo Delta");
  await expect(list).not.toContainText("Pessoa Exemplo Alfa");
  await list
    .getByRole("button")
    .filter({ hasText: "Pessoa Exemplo Beta" })
    .click();
  await expect(page.locator(".thread header")).toContainText(
    "Clínica Ana Luiza",
  );
  await page.getByRole("button", { name: "Abrir lead e campos" }).click();
  await expect(page.getByRole("dialog")).toContainText("Pessoa Exemplo Beta");
  await page.keyboard.press("Escape");
  for (const label of ["Calendário", "Tráfego Pago"]) {
    await system.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeVisible();
    await expect(page.getByText("Em breve", { exact: true })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Visão geral", exact: true })
    .click();
  await expect(page.getByLabel("Clínica em contexto")).toHaveValue(
    "00000000-0000-4000-8000-000000000020",
  );
});
