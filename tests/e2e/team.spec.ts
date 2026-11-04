import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("equipe cadastra, personaliza, confirma troca, valida duplicidade e persiste na navegação", async ({
  page,
}) => {
  await page.goto("/app/configuracoes");
  await page.getByRole("tab", { name: "Equipe", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar funcionário" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana Silva");
  await page.getByLabel("E-mail", { exact: true }).fill("ana@example.com");
  await expect(page.getByLabel("Somente clientes selecionados")).toBeChecked();
  await page.getByLabel("Clientes: Excluir", { exact: true }).check();
  await expect(
    page.getByText("Permissões personalizadas", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: /^Cargo/ }).selectOption("manager");
  await page.getByRole("button", { name: "Manter cargo atual" }).click();
  await expect(page.getByRole("combobox", { name: /^Cargo/ })).toHaveValue(
    "attendant",
  );
  await page.getByRole("button", { name: "Restaurar padrão do cargo" }).click();
  await expect(
    page.getByLabel("Clientes: Excluir", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("combobox", { name: /^Cargo/ }).selectOption("manager");
  await page.getByRole("checkbox", { name: /Clínica Ana Luiza/ }).check();
  await page.getByRole("button", { name: "Salvar funcionário" }).click();
  await expect(
    page.getByText("ana@example.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adicionar funcionário" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana duplicada");
  await page.getByLabel("E-mail", { exact: true }).fill("ANA@example.com");
  await page.getByRole("button", { name: "Salvar funcionário" }).click();
  await expect(page.locator(".team-editor [role=alert]")).toContainText(
    "já está cadastrado",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Editar acessos" }).click();
  await page.getByLabel("Funcionário ativo").uncheck();
  await page.getByRole("button", { name: "Salvar funcionário" }).click();
  await expect(
    page.locator("tbody").getByText("Inativo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Fila de atendimento", exact: true })
    .click();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("tab", { name: "Equipe", exact: true }).click();
  await expect(
    page.getByText("ana@example.com", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/team-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Editar acessos" }).click();
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
  await page.screenshot({ path: "test-results/team-mobile.png" });
});
