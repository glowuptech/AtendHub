import { test, expect } from "@playwright/test";
import { clients } from "../../src/lib/mocks/fixtures";
import { emptyMetrics } from "../../src/features/paid-media/metrics";
import type { MediaReport, Plan } from "../../src/features/paid-media/model";

const clientId = "00000000-0000-4000-8000-000000000901";
const empty = {
  canManage: true,
  attributionAvailable: true,
  clients: [{ id: clientId, name: "Clínica de teste", code: null }],
  accounts: [],
  campaigns: [],
  ads: [],
  totals: [],
  daily: [],
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
    synced = false,
    credentialSaved = false;
  const credentialStatus = () => ({
    configured: credentialSaved,
    updatedAt: credentialSaved ? "2026-11-23T13:00:00Z" : null,
    setupMessage: null,
  });
  await page.route("**/api/paid-media**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const cmd = route.request().postDataJSON();
      if (cmd.action === "saveMetaCredential") {
        expect(cmd.version).toBeUndefined();
        if (cmd.token === "test-token-invalid")
          return route.fulfill({
            status: 422,
            json: { error: "Token recusado pela Meta." },
          });
        expect(cmd.token).toBe("test-token-valid");
        credentialSaved = true;
        return route.fulfill({ json: credentialStatus() });
      }
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
    if (url.searchParams.get("kind") === "metaCredential")
      return route.fulfill({ json: credentialStatus() });
    if (url.searchParams.get("kind") === "syncStatus")
      return route.fulfill({
        json: {
          configured: true,
          accounts: [
            {
              accountId: "act_12",
              state: "failed",
              lastAttemptAt: "2026-11-23T08:00Z",
              error: "Confira a credencial Meta.",
            },
          ],
        },
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
  const tokenField = page.getByLabel("Token de acesso");
  await expect(tokenField).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Versão da Graph API")).toHaveCount(0);
  await tokenField.fill("test-token-invalid");
  await page.getByRole("button", { name: "Salvar token" }).click();
  await expect(page.getByRole("alert")).toHaveText("Token recusado pela Meta.");
  await tokenField.fill("test-token-valid");
  await page.getByRole("button", { name: "Salvar token" }).click();
  await expect(tokenField).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Atualizar token" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buscar contas na Meta" }).click();
  await page
    .getByRole("combobox", { name: "Conta", exact: true })
    .selectOption("act_12");
  await page
    .getByRole("combobox", { name: "Uso da conta" })
    .selectOption("shared");
  await page.getByRole("button", { name: "Vincular conta" }).click();
  await expect(
    page.getByText(/Falha na sincronização.*Confira a credencial Meta/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sincronizar período" }).click();
  await expect(
    page.getByText("Sincronização concluída.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Funil AIDA" }).click();
  const attraction = page.locator("section").filter({
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

test("mostra os resultados, os recortes da Meta e o limite por conta no resumo", async ({
  page,
}) => {
  await page.route("**/api/paid-media?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("kind") === "analytics")
      return route.fulfill({
        json: {
          accounts: [
            {
              accountId: "act_12",
              delivery: {
                spend: 270,
                impressions: 4000,
                reach: 2000,
                linkClicks: 200,
                engagement: 400,
              },
              billing: { spendLimit: 1000, remainingLimit: 750 },
              genders: [
                { key: "female", impressions: 3000, linkClicks: 150 },
                { key: "male", impressions: 1000, linkClicks: 50 },
              ],
              ages: [{ key: "25-34", impressions: 4000, linkClicks: 200 }],
              placements: [
                { key: "instagram:feed", impressions: 4000, linkClicks: 200 },
              ],
            },
          ],
        },
      });
    const results = {
      ...metrics,
      spend: 270,
      impressions: 4000,
      form_leads: 5,
      whatsapp_conversations: 1,
      crmLeads: 2,
      crmForms: 1,
      crmWhatsApp: 1,
      qualified: 1,
      appointments: 1,
    };
    const day = params.get("to");
    return route.fulfill({
      json: {
        ...report,
        totals: [{ currency: "BRL", ...results }],
        daily: [
          {
            currency: "BRL",
            day,
            spend: 270,
            form_leads: 5,
            whatsapp_conversations: 1,
          },
        ],
        campaigns: [{ ...report.campaigns[0], metrics: results }],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/editor-harness/index.html?paid-media");
  const summary = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Resumo em BRL" }) });
  await expect(summary.getByText("R$ 45,00")).toBeVisible();
  await expect(summary.getByText("50%")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Investimento e leads por dia/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Dia no gráfico" }),
  ).toBeVisible();
  await expect(page.getByText("Instagram · Feed")).toBeVisible();
  await expect(page.getByText("Feminino")).toBeVisible();
  await expect(page.getByText("75%")).toBeVisible();
  await expect(page.getByText("R$ 750,00")).toBeVisible();
  await expect(page.getByText("2.000", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Comparar por" })
    .selectOption("linkClicks");
  await expect(page.getByText("150", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  const day = page.getByRole("combobox", { name: "Dia no gráfico" });
  await expect(day.locator("option")).toHaveCount(7);
  await day.selectOption({ index: 0 });
  await expect(page.getByText("Dia sem dados importados.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("perfil do cliente usa a mesma faixa de datas na Visão geral e no dashboard", async ({
  page,
}) => {
  const profileId = clients[0].id;
  await page.route(`**/api/clients/${profileId}/overview?**`, async (route) => {
    const search = new URL(route.request().url()).searchParams;
    const day = search.get("to")!;
    return route.fulfill({
      json: {
        leadCount: 7,
        appointmentCount: 0,
        converted: 2,
        responded: 5,
        responseAverage: 8,
        handlingCount: 1,
        handlingAverage: 10,
        views: 12,
        submitted: 3,
        attendance: { present: 0, known: 0 },
        daily: [{ day, leads: 7, appointments: 0 }],
        stages: { new: 7 },
        forms: [
          { id: "form", name: "Captação da clínica", views: 12, submitted: 3 },
        ],
        awaitingResponse: [],
        recentAppointments: [],
      },
    });
  });
  await page.route("**/api/paid-media?**", async (route) => {
    const search = new URL(route.request().url()).searchParams;
    expect(search.get("clientId")).toBe(profileId);
    if (search.get("kind") === "analytics")
      return route.fulfill({ json: { accounts: [] } });
    const value = { ...metrics, spend: 180 };
    return route.fulfill({
      json: {
        ...report,
        clients: [{ id: profileId, name: clients[0].name, code: "C00" }],
        accounts: report.accounts.map((a) => ({
          ...a,
          clientIds: [profileId],
        })),
        campaigns: report.campaigns.map((c) => ({
          ...c,
          client_id: profileId,
          metrics: value,
        })),
        totals: [{ currency: "BRL", ...value }],
        daily: [
          {
            currency: "BRL",
            day: search.get("to"),
            spend: 180,
            form_leads: 4,
            whatsapp_conversations: 2,
          },
        ],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/editor-harness/index.html?client-profile");
  await expect(page.getByText("Captação da clínica")).toBeVisible();
  await expect(page.getByText("R$ 180,00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  const from = await page.getByLabel("De", { exact: true }).inputValue();
  await page
    .getByRole("button", { name: "Ver dashboard de tráfego pago" })
    .click();
  const dashboard = page.getByRole("region", {
    name: "Dashboard de tráfego pago do cliente",
  });
  await expect(
    dashboard.getByRole("heading", { name: "Resumo em BRL" }),
  ).toBeVisible();
  await expect(dashboard.getByLabel("De", { exact: true })).toHaveValue(from);
  await expect(
    dashboard.getByRole("img", { name: /Investimento e leads por dia/ }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toHaveCount(0);
  await dashboard.getByRole("button", { name: "Últimos 30 dias" }).click();
  const updatedFrom = await dashboard
    .getByLabel("De", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Visão geral" }).click();
  await expect(page.getByLabel("De", { exact: true })).toHaveValue(updatedFrom);
  await expect(page.getByText("R$ 180,00", { exact: true })).toBeVisible();
});
