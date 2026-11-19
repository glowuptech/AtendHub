import type { SupabaseClient } from "@supabase/supabase-js";
import { shiftDay, daysBetween } from "@/lib/date-range";
import {
  aggregateDashboard,
  type DashboardDataset,
  type DashboardClient,
  type DashboardResponse,
} from "./metrics";

type DbError = { code?: string; message: string };
// Explicit pages avoid PostgREST's default 1000-row cap. ID ordering makes page
// boundaries deterministic; only aggregates leave this server module.
export async function readPages<T>(
  build: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: unknown[] | null; error: DbError | null }>,
): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await build(start, start + 499);
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 500) return result;
  }
}
export const missingInvestmentTable = (e: unknown) =>
  !!e &&
  typeof e === "object" &&
  "code" in e &&
  ["42P01", "PGRST205"].includes(String(e.code));
const chunks = <T>(items: T[], size = 100) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
type LeadRow = {
  id: string;
  client_id: string;
  created_at: string;
  stage: string;
  capture_status: string;
  owner_id: string | null;
  first_response_at: string | null;
  claimed_at: string | null;
};
type AppointmentRow = {
  id: string;
  client_id: string;
  lead_id: string;
  starts_at: string;
  status: string;
  attendance: string;
};
export async function loadDashboard(
  db: SupabaseClient,
  organizationId: string,
  role: string,
  filter: { from: string; to: string; vertical: string; clientId: string },
): Promise<DashboardResponse> {
  const [clientRows, operations] = await Promise.all([
    readPages<{
      id: string;
      name: string;
      status: string;
      operation_id: string;
    }>((start, end) =>
      db
        .from("atendhub_clients")
        .select("id,name,status,operation_id")
        .eq("organization_id", organizationId)
        .order("id")
        .range(start, end),
    ),
    readPages<{ id: string; code: string }>((start, end) =>
      db
        .from("atendhub_operations")
        .select("id,code")
        .eq("organization_id", organizationId)
        .order("id")
        .range(start, end),
    ),
  ]);
  const clients: DashboardClient[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    vertical:
      operations.find((o) => o.id === c.operation_id)?.code === "prescrita"
        ? "healthcare"
        : operations.find((o) => o.id === c.operation_id)?.code === "veredite"
          ? "legal"
          : "unknown",
  }));
  if (filter.clientId && !clients.some((c) => c.id === filter.clientId))
    throw new Error("CLIENT_FORBIDDEN");
  const ids = clients
    .filter(
      (c) =>
        (!filter.clientId || c.id === filter.clientId) &&
        (filter.vertical === "all" || c.vertical === filter.vertical),
    )
    .map((c) => c.id);
  const previousRange = {
    from: shiftDay(filter.from, -(daysBetween(filter.from, filter.to) + 1)),
    to: shiftDay(filter.from, -1),
  };
  const dataset: DashboardDataset = {
    clients,
    leads: [],
    appointments: [],
    forms: [],
    investments: [],
  };
  let investmentAvailable = true;
  for (const clientIds of chunks(ids)) {
    const startAt = `${previousRange.from}T00:00:00-03:00`,
      endAt = `${shiftDay(filter.to, 1)}T00:00:00-03:00`;
    const baseAppointments = () =>
      db
        .from("atendhub_appointments")
        .select("id,client_id,lead_id,starts_at,status,attendance")
        .eq("organization_id", organizationId)
        .in("client_id", clientIds);
    const [leads, appointments, forms, investments] = await Promise.all([
      readPages<LeadRow>((start, end) =>
        db
          .from("atendhub_leads")
          .select(
            "id,client_id,created_at,stage,capture_status,owner_id,first_response_at,claimed_at",
          )
          .eq("organization_id", organizationId)
          .in("client_id", clientIds)
          .gte("created_at", startAt)
          .lt("created_at", endAt)
          .order("id")
          .range(start, end),
      ),
      readPages<AppointmentRow>((start, end) =>
        baseAppointments()
          .gte("starts_at", startAt)
          .lt("starts_at", endAt)
          .order("id")
          .range(start, end),
      ),
      readPages<{ client_id: string; status: string }>((start, end) =>
        db
          .from("atendhub_forms")
          .select("id,client_id,status")
          .eq("organization_id", organizationId)
          .in("client_id", clientIds)
          .order("id")
          .range(start, end),
      ),
      readPages<{
        client_id: string;
        day: string;
        amount_cents: number;
        notes: string;
      }>((start, end) =>
        db
          .from("atendhub_daily_investments")
          .select("id,client_id,day,amount_cents,notes")
          .eq("organization_id", organizationId)
          .in("client_id", clientIds)
          .gte("day", previousRange.from)
          .lte("day", filter.to)
          .order("id")
          .range(start, end),
      ).catch((e) => {
        if (!missingInvestmentTable(e)) throw e;
        investmentAvailable = false;
        return [];
      }),
    ]);
    // Cohort conversion includes future appointments and counts each lead once,
    // independently from consultation-date metrics (which may use older leads).
    for (const leadIds of chunks(leads.map((l) => l.id))) {
      appointments.push(
        ...(await readPages<AppointmentRow>((start, end) =>
          baseAppointments()
            .in("lead_id", leadIds)
            .order("id")
            .range(start, end),
        )),
      );
    }
    dataset.leads.push(
      ...leads.map((l) => ({
        id: l.id,
        clientId: l.client_id,
        createdAt: l.created_at,
        stage: l.stage,
        captureStatus: l.capture_status,
        ownerId: l.owner_id,
        firstResponseAt: l.first_response_at,
        claimedAt: l.claimed_at,
      })),
    );
    dataset.appointments.push(
      ...[...new Map(appointments.map((a) => [a.id, a])).values()].map((a) => ({
        id: a.id,
        clientId: a.client_id,
        leadId: a.lead_id,
        scheduledAt: a.starts_at,
        status: a.status,
        attendance: a.attendance,
      })),
    );
    dataset.forms.push(
      ...forms.map((f) => ({ clientId: f.client_id, status: f.status })),
    );
    dataset.investments.push(
      ...investments.map((i) => ({
        clientId: i.client_id,
        day: i.day,
        amountCents: Number(i.amount_cents),
        notes: i.notes,
      })),
    );
  }
  return {
    current: aggregateDashboard(
      dataset,
      filter,
      filter.vertical,
      filter.clientId,
    ),
    previous: aggregateDashboard(
      dataset,
      previousRange,
      filter.vertical,
      filter.clientId,
    ),
    clients,
    investmentAvailable,
    canManageInvestments: investmentAvailable && role === "super_admin",
    updatedAt: new Date().toISOString(),
  };
}
