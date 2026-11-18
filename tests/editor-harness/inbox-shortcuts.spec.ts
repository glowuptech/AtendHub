import { test, expect, type Page } from "@playwright/test";
async function openChat(page: Page, suffix = "") {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tests/editor-harness/index.html?inbox" + suffix);
  await page
    .getByRole("button", { name: /Adriele.*Pronto para iniciar/ })
    .click();
  await page.getByLabel("Número comercial").selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Abrir conversa", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem registrada" }),
  ).toBeVisible();
}
test("atalhos abrem ficha e cadastro sem sair do chat, e agenda fixa o cliente/lead", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "test-scheduling",
      JSON.stringify({
        name: "Agenda",
        url: "https://agenda.example/consulta",
      }),
    ),
  );
  await openChat(page);
  const toolbar = page.getByRole("navigation", { name: "Atalhos da conversa" });
  await page
    .getByPlaceholder("Escreva uma mensagem…")
    .fill("Rascunho preservado");
  await expect(
    toolbar.getByRole("link", { name: "Abrir agendamento externo" }),
  ).toHaveAttribute("href", "https://agenda.example/consulta");
  await toolbar
    .getByRole("button", { name: "Abrir lead e campos", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Ficha do lead", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await toolbar
    .getByRole("button", { name: "Adicionar informações", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Adicionar informações pessoais",
  });
  await form
    .getByLabel("Nome completo", { exact: true })
    .fill("Nome Completo Teste");
  await form.getByLabel("CPF", { exact: true }).fill("52998224725");
  await form.getByRole("button", { name: "Salvar dados pessoais" }).click();
  await expect(form.getByText("Dados pessoais salvos.")).toBeVisible();
  await page.keyboard.press("Escape");
  await toolbar.getByRole("button", { name: "Agendar", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  const booking = page.getByRole("dialog", {
    name: "Criar agendamento",
    exact: true,
  });
  await expect(booking).toContainText("Adriele");
  await booking
    .getByText("Dados pessoais e valor do serviço", { exact: true })
    .click();
  await expect(
    booking.getByLabel("Nome completo", { exact: true }),
  ).toHaveValue("Nome Completo Teste");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Agendar nesta conversa", exact: true }),
  ).toBeVisible();
  let bookingBody: Record<string, unknown> | null = null;
  await page.route("**/api/clients/*/appointments", async (route) => {
    bookingBody = route.request().postDataJSON();
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    await route.fulfill({ json: { created: true, bookingDetailsSaved: true } });
  });
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  const newBooking = page.getByRole("dialog", {
    name: "Criar agendamento",
    exact: true,
  });
  await newBooking
    .getByText("Dados pessoais e valor do serviço", { exact: true })
    .click();
  await newBooking
    .getByLabel("Serviço ou consulta", { exact: true })
    .fill("Consulta");
  await newBooking.getByLabel("Valor previsto (R$)").fill("350,00");
  await newBooking
    .getByRole("button", { name: "Salvar agendamento", exact: true })
    .click();
  await expect(
    page.getByText("Agendamento salvo.", { exact: true }),
  ).toBeVisible();
  expect(bookingBody).toMatchObject({
    conversationId: expect.any(String),
    leadId: expect.any(String),
    service: { description: "Consulta", amountCents: 35000, currency: "BRL" },
  });
  await page.keyboard.press("Escape");
  await toolbar
    .getByRole("button", { name: "Vincular valor", exact: true })
    .click();
  const value = page.getByRole("dialog", {
    name: "Valor do serviço nesta conversa",
  });
  await value
    .getByLabel("Serviço ou consulta", { exact: true })
    .fill("Consulta");
  await value.getByLabel("Valor previsto (R$)").fill("350,00");
  await value.getByRole("button", { name: "Salvar valor previsto" }).click();
  await expect(value.getByText("Valor previsto salvo.")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(page.url()).toContain("?inbox");
  await expect(page.getByPlaceholder("Escreva uma mensagem…")).toHaveValue(
    "Rascunho preservado",
  );
  await page.screenshot({ path: "/tmp/atendhub-inbox-shortcuts.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await toolbar
    .getByRole("button", { name: "Adicionar informações", exact: true })
    .click();
  const mobileDialog = page.getByRole("dialog", {
    name: "Adicionar informações pessoais",
  });
  const bounds = await mobileDialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await expect(
    mobileDialog.getByLabel("Nome completo", { exact: true }),
  ).toHaveValue("Nome Completo Teste");
});
test("campos novos pendentes não mostram falso salvamento", async ({
  page,
}) => {
  await openChat(page, "&pending-fields");
  await page
    .getByRole("navigation", { name: "Atalhos da conversa" })
    .getByRole("button", { name: "Adicionar informações", exact: true })
    .click();
  await expect(
    page.getByText(/cadastro destes campos.*aguarda ativação/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar dados pessoais" }),
  ).toBeDisabled();
});

test("valor e dados extras da agenda aguardam capacidade real do servidor", async ({
  page,
}) => {
  await openChat(page, "&pending-fields");
  const toolbar = page.getByRole("navigation", { name: "Atalhos da conversa" });
  await toolbar
    .getByRole("button", { name: "Vincular valor", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar valor previsto" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await toolbar.getByRole("button", { name: "Agendar", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  const booking = page.getByRole("dialog", {
    name: "Criar agendamento",
    exact: true,
  });
  await booking
    .getByText("Dados pessoais e valor do serviço", { exact: true })
    .click();
  await expect(
    booking.getByText(/ativação destes campos no banco está pendente/),
  ).toBeVisible();
  await expect(booking.getByLabel("Valor previsto (R$)")).toBeDisabled();
});
