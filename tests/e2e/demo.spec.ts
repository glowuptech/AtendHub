import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
let runtimeErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
});
test.afterEach(() => {
  expect(runtimeErrors).toEqual([]);
});
const a = "00000000-0000-4000-8000-000000000010",
  b = "00000000-0000-4000-8000-000000000020",
  f = "00000000-0000-4000-8000-000000000300";
test("dashboard, contexto e isolamento de navegação", async ({ page }) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", {
      name: "O cuidado começa no primeiro contato.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Pessoa Exemplo Alfa")).toBeVisible();
  await page.getByLabel("Clínica em contexto").selectOption(b);
  await expect(page.getByText("Pessoa Exemplo Alfa")).toHaveCount(0);
  await expect(page.getByText("Pessoa Exemplo Delta")).toBeVisible();
  await page.getByRole("link", { name: "Leads e CRM" }).click();
  await expect(page.getByText("Pessoa Exemplo Delta")).toBeVisible();
  await page.getByLabel("Clínica em contexto").selectOption(a);
  await expect(page.getByText("Pessoa Exemplo Delta")).toHaveCount(0);
  await page.getByRole("link", { name: /Pessoa Exemplo Alfa/ }).click();
  await expect(page.getByText("Não informado", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Origens" })).toBeVisible();
});
test("wizard mobile valida, navega e termina sem rede ou armazenamento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const outbound: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith("http://127.0.0.1:3000"))
      outbound.push(req.url());
  });
  await page.goto("/f/ana-luiza-ginecologia-demo");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Nome de demonstração" })
    .fill("Pessoa Teste DEMO");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Telefone fictício" })
    .fill("+5500000000000");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Período desejado" })
    .selectOption("morning");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Concluir demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Pronto, demonstração concluída." }),
  ).toBeVisible();
  expect(outbound).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    })),
  ).toEqual({ local: 0, session: 0, overflow: false });
  await page.screenshot({
    path: "test-results/form-mobile.png",
    fullPage: true,
  });
});
test("editor reutiliza explicitamente, cria campo, salva e conserva versão anterior", async ({
  page,
}) => {
  await page.goto(`/app/clientes/${a}/formularios/${f}/editar`);
  await page
    .getByLabel("Nome do formulário", { exact: true })
    .fill("Formulário revisado DEMO");
  await page.getByRole("button", { name: "Salvar rascunho DEMO" }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  await page.getByRole("link", { name: "Voltar aos formulários" }).click();
  await expect(
    page.getByRole("heading", { name: "Formulário revisado DEMO" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Novo formulário" }).click();
  await page
    .getByLabel("Campo desta clínica")
    .selectOption("00000000-0000-4000-8000-000000000101");
  await expect(
    page.getByRole("button", { name: "Adicionar pergunta" }),
  ).toBeDisabled();
  await page.getByLabel("Confirmo a reutilização").check();
  await page.getByRole("button", { name: "Adicionar pergunta" }).click();
  await page.getByLabel("Vínculo com o catálogo").selectOption("new");
  await page
    .getByLabel("Nome do campo", { exact: true })
    .fill("Canal administrativo");
  await page.getByLabel("Chave estável").fill("canal_admin");
  await page.getByRole("button", { name: "Adicionar pergunta" }).click();
  await page.getByRole("button", { name: "Salvar rascunho DEMO" }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  await page.getByRole("link", { name: "Abrir prévia salva" }).click();
  await expect(page.getByText("Etapa 1 de 2")).toBeVisible();
});
test("fila, inbox, portal e mensuração são honestamente demonstrativos", async ({
  page,
}) => {
  await page.goto("/app/fila");
  await page.getByRole("button", { name: "Assumir · simulação" }).click();
  await expect(page.getByRole("status")).toContainText("em memória");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("button", { name: "Demonstrar resposta" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nenhuma mensagem foi enviada",
  );
  await page.goto(`/app/clientes/${a}/formularios/${f}/tracking`);
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await page.goto("/portal/agendamentos");
  await page.getByRole("button", { name: "Compareceu", exact: true }).click();
  await expect(
    page.getByText("Compareceu · simulado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inbox", exact: true }),
  ).toHaveCount(0);
});
test("estados e acessibilidade desktop/mobile", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Testar estado").selectOption("error");
  await expect(page.locator("p[role=alert]")).toContainText(
    "Falha demonstrativa",
  );
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.getByLabel("Testar estado").selectOption("empty");
  await expect(
    page.getByRole("heading", { name: "Nenhum registro neste recorte" }),
  ).toBeVisible();
  await page.getByLabel("Testar estado").selectOption("ready");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/f/ana-luiza-ginecologia-demo");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
