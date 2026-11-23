import { test, expect } from "@playwright/test";
import { emptyMetrics } from "../../src/features/paid-media/metrics";
import type { MediaReport, Plan } from "../../src/features/paid-media/model";

const clientId = "00000000-0000-4000-8000-000000000901";
const empty = {
  canManage: true,
  metaConfigured: true,
  attributionAvailable: true,
  clients: [{ id: clientId, name: "Clínica de teste", code: null }],
  accounts: [],
  campaigns: [],
  ads: [],
  totals: [],
  pending: [],
} satisfies MediaReport;
const metrics = {
  ...emptyMetrics(),
  spend: 100,
  impressions: 2000,
  profile_visits: 10,
};
const report: MediaReport = {
  ...empty,
  clients: [{ id: clientId, name: "Clínica de teste", code: "C00" }],
  accounts: [
    {
      account_id: "act_12",
      name: "Conta teste",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      shared: true,
      latestSync: "2026-11-23T10:00Z",
      coveredDays: 1,
      clientIds: [clientId],
    },
  ],
  campaigns: [
    {
      account_id: "act_12",
      campaign_id: "100",
      name: "Campanha de teste",
      client_id: clientId,
      stage: "ATR",
      manual: false,
      currency: "BRL",
      metrics,
    },
  ],
  totals: [{ currency: "BRL", ...metrics }],
};

test("vincula uma conta, sincroniza e exibe o indicador de Atração", async ({
  page,
}) => {
  let linked = false,
    synced = false;
  await page.route("**/api/paid-media**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const cmd = route.request().postDataJSON();
      if (cmd.action === "link") {
        expect(cmd).toMatchObject({
          clientId,
          accountId: "act_12",
          mode: "shared",
        });
        linked = true;
      }
      if (cmd.action === "sync") {
        expect(cmd.accountId).toBe("act_12");
        synced = true;
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (url.searchParams.get("kind") === "metaAccounts")
      return route.fulfill({
        json: [
          {
            id: "act_12",
            name: "Conta teste",
            currency: "BRL",
            timezone_name: "America/Sao_Paulo",
          },
        ],
      });
    return route.fulfill({
      json: synced
        ? report
        : linked
          ? {
              ...empty,
              accounts: report.accounts.map((a) => ({ ...a, coveredDays: 0 })),
            }
          : empty,
    });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/editor-harness/index.html?paid-media");
  await expect(
    page.getByText("Nenhuma conta vinculada neste recorte."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Contas vinculadas" }).click();
  await page.getByRole("button", { name: "Buscar contas na Meta" }).click();
  await page
    .getByRole("combobox", { name: "Conta", exact: true })
    .selectOption("act_12");
  await page
    .getByRole("combobox", { name: "Uso da conta" })
    .selectOption("shared");
  await page.getByRole("button", { name: "Vincular conta" }).click();
  await page.getByRole("button", { name: "Sincronizar período" }).click();
  await expect(page.getByRole("status")).toHaveText("Sincronização concluída.");
  await page.getByRole("button", { name: "Funil AIDA" }).click();
  const attraction = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Atração", exact: true }),
    });
  await expect(attraction).toContainText("Visitas ao perfil");
  await expect(attraction).toContainText("10");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("salva um plano AIDA, mantém vínculos e mostra realizado", async ({
  page,
}) => {
  const plans: Plan[] = [];
  await page.route("**/api/paid-media**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("assistant"))
      return route.fulfill({ json: { configured: false, items: [] } });
    if (route.request().method() === "POST") {
      const { plan } = route.request().postDataJSON();
      expect(plan.stages.ATR).toMatchObject({
        hypothesis: "Um vídeo melhora a descoberta.",
        campaignIds: ["100"],
      });
      const saved = {
        ...plan,
        id: "00000000-0000-4000-8000-000000000902",
        revision: 1,
      };
      plans.splice(0, plans.length, saved);
      return route.fulfill({ json: saved });
    }
    if (url.searchParams.get("kind") === "plans")
      return route.fulfill({ json: plans });
    return route.fulfill({ json: report });
  });
  await page.goto("/tests/editor-harness/index.html?campaign-planning");
  await page
    .getByRole("textbox", { name: "Nome do plano" })
    .fill("Plano de novembro");
  await page
    .getByRole("textbox", { name: "Hipótese", exact: true })
    .first()
    .fill("Um vídeo melhora a descoberta.");
  await page
    .getByRole("listbox", { name: "Campanhas vinculadas" })
    .first()
    .selectOption("100");
  await page.getByRole("button", { name: "Salvar plano" }).click();
  await expect(
    page.getByRole("heading", { name: "Plano de novembro", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Realizado · período salvo")).toBeVisible();
  await page.reload();
  await page
    .getByRole("combobox", { name: "Plano", exact: true })
    .selectOption({ label: "Plano de novembro · Rascunho" });
  await expect(
    page.getByRole("textbox", { name: "Hipótese", exact: true }).first(),
  ).toHaveValue("Um vídeo melhora a descoberta.");
});
