import { test, expect, type Page } from "@playwright/test";
const defaultCalendar = {
  timezone: "America/Sao_Paulo",
  weekdays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "17:00",
  holidays: [],
  exceptions: {},
};
async function seed(page: Page, created: string, calendar: unknown = null) {
  await page.addInitScript(
    ({ created, calendar }) => {
      localStorage.setItem("test-queue-created-at", created);
      if (!localStorage.getItem("test-service-calendar"))
        localStorage.setItem("test-service-calendar", JSON.stringify(calendar));
    },
    { created, calendar },
  );
}
const timer = (page: Page) => page.locator(".queue-clock");

test("contador desce por segundo, vence em 00:00 vermelho e mantém vencimento após reload", async ({
  page,
}) => {
  const start = Date.parse("2026-11-03T09:00:00-03:00");
  await seed(page, new Date(start).toISOString());
  await page.clock.setFixedTime(new Date(start));
  await page.goto("/tests/editor-harness/index.html?queue");
  await expect(timer(page).getByRole("strong")).toHaveText("10:00");
  await expect(page.getByText(/Usando calendário padrão/)).toBeVisible();
  await page.clock.setFixedTime(new Date(start + 1000));
  await expect(timer(page).getByRole("strong")).toHaveText("09:59");
  await page.clock.setFixedTime(new Date(start + 599000));
  await expect(timer(page).getByRole("strong")).toHaveText("00:01");
  await page.clock.setFixedTime(new Date(start + 600000));
  await expect(timer(page).getByRole("strong")).toHaveText("00:00");
  await expect(timer(page)).toHaveClass(/late/);
  await expect(timer(page)).toContainText("Lead sem atendimento · atenção");
  await expect(timer(page)).toHaveCSS("color", "rgb(160, 41, 53)");
  await page.clock.setFixedTime(new Date(start + 3600000));
  await page.reload();
  await expect(timer(page).getByRole("strong")).toHaveText("00:00");
  await expect(timer(page)).toHaveClass(/late/);
  await expect(
    page.getByRole("button", { name: "Assumir atendimento", exact: true }),
  ).toBeEnabled();
});

test("saldo pausa sexta à noite, no fim de semana e no feriado, retomando na abertura seguinte", async ({
  page,
}) => {
  await seed(page, "2026-11-06T16:55:00-03:00", {
    ...defaultCalendar,
    holidays: ["2026-11-09"],
  });
  await page.clock.setFixedTime(new Date("2026-11-06T18:00:00-03:00"));
  await page.goto("/tests/editor-harness/index.html?queue");
  await expect(timer(page).getByRole("strong")).toHaveText("05:00");
  await expect(timer(page)).toContainText("Pausado");
  for (const date of [
    "2026-11-07T10:00:00-03:00",
    "2026-11-09T10:00:00-03:00",
    "2026-11-10T08:59:59-03:00",
  ]) {
    await page.clock.setFixedTime(new Date(date));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(timer(page).getByRole("strong")).toHaveText("05:00");
    await expect(timer(page)).toContainText("Pausado");
  }
  await page.clock.setFixedTime(new Date("2026-11-10T09:00:01-03:00"));
  await expect(timer(page).getByRole("strong")).toHaveText("04:59");
  await expect(timer(page)).not.toContainText("Pausado");
});

test("calendário editado não reseta os campos, atualiza a fila ao salvar e reabre persistido", async ({
  page,
}) => {
  await seed(page, "2026-11-23T09:00:00-03:00");
  await page.clock.setFixedTime(new Date("2026-11-23T09:00:00-03:00"));
  await page.goto("/tests/editor-harness/index.html?queue&calendar-editor");
  await expect(timer(page).getByRole("strong")).toHaveText("10:00");
  await page.getByLabel("Início do expediente").fill("10:00");
  await page.getByLabel("Fim do expediente").fill("18:00");
  await page.getByLabel("Feriados e exceções").fill("2026-11-23");
  await expect(page.getByLabel("Início do expediente")).toHaveValue("10:00");
  await page
    .getByRole("button", { name: "Salvar calendário", exact: true })
    .click();
  await expect(
    page.getByText("Calendário salvo. Os prazos da fila foram atualizados."),
  ).toBeVisible();
  await expect(page.getByText(/Usando calendário padrão/)).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-11-23T10:05:00-03:00"));
  await expect(timer(page)).toContainText("Pausado");
  await expect(timer(page).getByRole("strong")).toHaveText("10:00");
  await page.clock.setFixedTime(new Date("2026-11-24T10:00:01-03:00"));
  await page.reload();
  await expect(timer(page).getByRole("strong")).toHaveText("09:59");
  await expect(page.getByLabel("Início do expediente")).toHaveValue("10:00");
});

test("falha ao ler calendário não calcula SLA com horários presumidos", async ({
  page,
}) => {
  await seed(page, "2026-11-03T09:00:00-03:00");
  await page.clock.setFixedTime(new Date("2026-11-03T09:05:00-03:00"));
  await page.goto("/tests/editor-harness/index.html?queue&calendar-error");
  await expect(timer(page)).toContainText("Prazo indisponível");
  await expect(
    page.getByText(/Não foi possível carregar o calendário de SLA/),
  ).toBeVisible();
  await expect(page.getByText(/Usando calendário padrão/)).toHaveCount(0);
});
