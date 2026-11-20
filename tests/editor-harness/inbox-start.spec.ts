import { test, expect } from "@playwright/test";
test("lead atribuído aparece sem mensagem e permite escolher a linha para iniciar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/tests/editor-harness/index.html?inbox");
  await expect(
    page.getByRole("button", { name: /Adriele.*Pronto para iniciar/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Adriele.*Pronto para iniciar/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir conversa", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Número comercial").selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Abrir conversa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem registrada" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Escreva uma mensagem…")).toBeEnabled();
  await expect(
    page.getByText("Pronto para iniciar · Sem mensagens"),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem registrada" }),
  ).toBeVisible();
});

test("encerrar e retomar mantém o histórico selecionado e controla o envio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/tests/editor-harness/index.html?inbox");
  await page
    .getByRole("button", { name: /Adriele.*Pronto para iniciar/ })
    .click();
  await page.getByLabel("Número comercial").selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Abrir conversa", exact: true })
    .click();
  const requests: string[] = [];
  await page.route("**/api/inbox/episodes", async (route) => {
    const { id, action } = route.request().postDataJSON();
    requests.push(action);
    await page.evaluate((action) => {
      const c = JSON.parse(localStorage.getItem("test-started-conversation")!);
      c.status = action === "close" ? "closed" : "open";
      c.canSend = c.status === "open";
      localStorage.setItem("test-started-conversation", JSON.stringify(c));
    }, action);
    await route.fulfill({ json: { id } });
  });
  await page
    .locator(".inbox-chat-header summary")
    .filter({ hasText: "Atendimento" })
    .click();
  await page.getByRole("button", { name: "Encerrar atendimento" }).click();
  await expect(page.locator(".inbox-chat textarea")).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Encerradas", exact: true }).click();
  await page
    .locator(".inbox-chat-header summary")
    .filter({ hasText: "Atendimento" })
    .click();
  await page.getByRole("button", { name: "Retomar atendimento" }).click();
  await expect(page.getByPlaceholder("Escreva uma mensagem…")).toBeEnabled();
  expect(requests).toEqual(["close", "resume"]);
});
