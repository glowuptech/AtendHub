import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDashboard } from "@/features/system-dashboard/server";
const org = "org",
  client = "00000000-0000-4000-8000-000000000001";
function database(fail?: string) {
  const calls: { table: string; organization?: unknown }[] = [];
  const rows: Record<string, Record<string, unknown>[]> = {
    atendhub_clients: [
      {
        id: client,
        name: "Autorizado",
        operation_id: "op",
        status: "active",
        organization_id: org,
      },
    ],
    atendhub_operations: [
      { id: "op", code: "prescrita", organization_id: org },
    ],
    atendhub_leads: [
      {
        id: "lead",
        client_id: client,
        created_at: "2026-11-03T12:00:00Z",
        capture_status: "completed",
        stage: "new",
        owner_id: null,
        first_response_at: null,
        claimed_at: null,
        organization_id: org,
      },
    ],
    atendhub_appointments: [
      {
        id: "future",
        client_id: client,
        lead_id: "lead",
        starts_at: "2026-12-01T12:00:00Z",
        status: "confirmed",
        attendance: "unknown",
        organization_id: org,
      },
    ],
    atendhub_forms: [
      {
        id: "form",
        client_id: client,
        status: "published",
        organization_id: org,
      },
    ],
    atendhub_daily_investments: [],
  };
  const db = {
    from(table: string) {
      const call: { table: string; organization?: unknown } = { table };
      calls.push(call);
      const conditions: ((r: Record<string, unknown>) => boolean)[] = [];
      let start = 0,
        end = 499;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq(key: string, value: unknown) {
          if (key === "organization_id") call.organization = value;
          conditions.push((r) => r[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) {
          conditions.push((r) => values.includes(r[key]));
          return query;
        },
        gte(key: string, value: string) {
          conditions.push(
            (r) => Date.parse(String(r[key])) >= Date.parse(value),
          );
          return query;
        },
        lt(key: string, value: string) {
          conditions.push(
            (r) => Date.parse(String(r[key])) < Date.parse(value),
          );
          return query;
        },
        lte() {
          return query;
        },
        range(a: number, b: number) {
          start = a;
          end = b;
          return query;
        },
        then(
          resolve: (result: {
            data: unknown[] | null;
            error: { code: string; message: string } | null;
          }) => unknown,
        ) {
          const error =
            table === "atendhub_daily_investments"
              ? { code: "PGRST205", message: "not installed" }
              : fail === table
                ? { code: "42501", message: "denied" }
                : null;
          return Promise.resolve({
            data: error
              ? null
              : (rows[table] ?? [])
                  .filter((r) => conditions.every((c) => c(r)))
                  .slice(start, end + 1),
            error,
          }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const filter = {
  from: "2026-11-03",
  to: "2026-11-03",
  vertical: "all",
  clientId: "",
};
it("consulta a organização da sessão, inclui conversão futura, não vaza IDs de leads e degrada somente investimento ausente", async () => {
  const { db, calls } = database();
  const result = await loadDashboard(db, org, "super_admin", filter);
  expect(result.current.total).toMatchObject({
    clients: 1,
    leads: 1,
    converted: 1,
    appointments: 0,
    forms: 1,
  });
  expect(result.previous.total.leads).toBe(0);
  expect(result.investmentAvailable).toBe(false);
  expect(result.canManageInvestments).toBe(false);
  expect(calls.every((c) => c.organization === org)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('"lead"');
  expect(JSON.stringify(result)).not.toContain('"future"');
});
it("recusa cliente fora do RLS antes de consultar métricas; falha de fonte obrigatória não vira zero", async () => {
  const { db, calls } = database();
  await expect(
    loadDashboard(db, org, "super_admin", { ...filter, clientId: "forbidden" }),
  ).rejects.toThrow("CLIENT_FORBIDDEN");
  expect(calls.some((c) => c.table === "atendhub_leads")).toBe(false);
  await expect(
    loadDashboard(database("atendhub_forms").db, org, "super_admin", filter),
  ).rejects.toMatchObject({ code: "42501" });
});
