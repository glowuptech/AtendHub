import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const client = "00000000-0000-4000-8000-000000000010";

test("inbox mantém rascunhos isolados, fontes por cliente e inserção sem envio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto(`/app/clientes/${client}`);
  await page
    .getByRole("button", { name: "Base de conhecimento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Pergunta ou nome do serviço") });
  await form
    .getByLabel("Pergunta ou nome do serviço")
    .fill("Quais documentos levar?");
  await form
    .getByLabel("Resposta / descrição")
    .fill("Leve um documento com foto.");
  await form
    .getByLabel("Fonte / documento e versão")
    .fill("Manual administrativo aprovado");
  await form
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("approved");
  await form
    .getByRole("button", { name: "Salvar resposta", exact: true })
    .click();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  const list = page.getByRole("region", { name: "Conversas", exact: true });
  await list
    .getByRole("button")
    .filter({ hasText: "Pessoa Exemplo Beta" })
    .click();
  await expect(page.locator(".inbox-context")).toBeVisible();
  const draft = page.getByRole("textbox", {
    name: "Mensagem para Pessoa Exemplo Beta",
  });
  await draft.fill("Olá! ");
  const historyCount = await page.locator(".inbox-message").count();
  await page.locator(".assistant-knowledge>summary").click();
  await expect(page.locator(".assistant-knowledge")).toContainText(
    "Manual administrativo aprovado",
  );
  await page
    .getByRole("button", { name: "Inserir no WhatsApp", exact: true })
    .click();
  await expect(draft).toHaveValue(/Leve um documento com foto/);
  await expect(page.locator(".inbox-message")).toHaveCount(historyCount);
  await expect(
    page.getByRole("button", { name: "Enviar mensagem", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enviar pergunta à IA", exact: true }),
  ).toBeDisabled();
  await list
    .getByRole("button")
    .filter({ hasText: "Pessoa Exemplo Delta" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Mensagem para Pessoa Exemplo Delta" }),
  ).toHaveValue("");
  await expect(page.locator(".assistant-header")).toContainText(
    "Clínica Horizonte",
  );
  await expect(page.locator(".inbox-context")).not.toContainText(
    "Leve um documento com foto",
  );
  await list
    .getByRole("button")
    .filter({ hasText: "Pessoa Exemplo Beta" })
    .click();
  await expect(draft).toHaveValue(/Leve um documento com foto/);
  await page
    .getByRole("button", { name: "Escolher emoji", exact: true })
    .click();
  await page.getByRole("button", { name: "Sorriso", exact: true }).click();
  await expect(draft).toHaveValue(/😊/);
  await page
    .getByRole("button", { name: "Editar cadastro", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/leads\//);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(draft).toHaveValue(/Leve um documento com foto/);
  await page
    .getByRole("button", { name: "Aguardando minha resposta", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma conversa encontrada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar conversa" })
    .fill("horizonte");
  await expect(list).toContainText("Pessoa Exemplo Delta");
  await expect(list).not.toContainText("Pessoa Exemplo Beta");
  await page.getByRole("textbox", { name: "Buscar conversa" }).fill("");
  await page.screenshot({ path: "test-results/inbox-desktop.png" });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.querySelector(".inbox-layout")!.getBoundingClientRect()
          .bottom <= innerHeight,
    ),
  ).toBe(true);
});

test("inbox mobile navega lista, chat e drawer com foco e sem overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/inbox");
  const list = page.getByRole("region", { name: "Conversas", exact: true });
  await expect(list).toBeVisible();
  await expect(page.locator(".inbox-chat")).not.toBeVisible();
  await page.screenshot({ path: "test-results/inbox-mobile-list.png" });
  await list
    .getByRole("button")
    .filter({ hasText: "Pessoa Exemplo Delta" })
    .click();
  await expect(list).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensagem para Pessoa Exemplo Delta" })
    .fill("Rascunho privado");
  await page.screenshot({ path: "test-results/inbox-mobile-chat.png" });
  await page
    .getByRole("button", { name: "Informações e IA", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Informações e Assistente IA",
  });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".assistant-header")).toContainText(
    "Clínica Horizonte",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/inbox-mobile-context.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Informações e IA", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(
    page.getByRole("textbox", { name: "Mensagem para Pessoa Exemplo Delta" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Voltar às conversas", exact: true })
    .click();
  await expect(list).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".inbox-chat")).toBeVisible();
  await expect(page.locator(".inbox-context")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Informações e IA", exact: true })
    .click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/inbox-notebook.png" });
});
