import { test, expect } from "@playwright/test";
test("assumir independe do calendário e atualiza responsável", async ({
  page,
}) => {
  await page.goto("/tests/editor-harness/index.html?queue");
  const button = page.getByRole("button", {
    name: "Assumir atendimento",
    exact: true,
  });
  await expect(
    page.getByText(/O calendário de SLA ainda não foi configurado/),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page.getByText("Atendimento de Lead de teste assumido e salvo."),
  ).toBeVisible();
  await expect(page.getByText("Responsável:")).toBeVisible();
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
