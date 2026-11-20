import { expect, test } from "@playwright/test";

test("telefonema registra primeiro o lembrete e depois a confirmação da consulta escolhida", async ({
  page,
}) => {
  const row = {
    id: "r1",
    appointment_id: "a1",
    lead_name: "Contato de teste",
    professional: "Médica A",
    starts_at: "2026-11-21T14:00:00Z",
    sent_at: null as string | null,
    confirmed_at: null as string | null,
    can_edit: true,
    dispatching: false,
    is_eve: true,
  };
  const other = {
    ...row,
    id: "r2",
    appointment_id: "a2",
    professional: "Médica B",
    can_edit: false,
  };
  await page.route("**/api/appointments/confirmations**", async (route) => {
    if (route.request().method() === "POST") {
      const { id, action } = route.request().postDataJSON();
      expect(id).toBe(row.id);
      if (action === "sent") row.sent_at = new Date().toISOString();
      else if (action === "confirmed")
        row.confirmed_at = new Date().toISOString();
      else throw Error("Ação inesperada");
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: [row, other] });
  });
  await page.goto("/tests/editor-harness/index.html?confirmations");
  const first = page.getByRole("article").filter({ hasText: "Médica A" });
  await expect(
    first.getByRole("button", { name: /paciente confirmou/ }),
  ).toHaveCount(0);
  await first
    .getByRole("button", { name: /lembrete feito por telefone/ })
    .click();
  await first.getByRole("button", { name: /paciente confirmou/ }).click();
  await page.reload();
  await expect(first).toContainText("lead qualificado");
  await expect(
    page.getByRole("article").filter({ hasText: "Médica B" }),
  ).toContainText("pendente");
});
