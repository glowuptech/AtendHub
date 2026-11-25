import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessAdmin } from "../accesses/server";
import { startOfBrazilDay } from "@/features/appointments/server";
import { readPages } from "@/features/system-dashboard/server";
import {
  episodeDurations,
  shiftDay,
  summarizeClientOverview,
  type EpisodeEvent,
  type OverviewAppointment,
  type OverviewLead,
  type OverviewRange,
} from "./overview";

type OverviewFilters = OverviewRange & { professional: string };
type FormRow = { id: string; name: string };
const batchSize = 100;
const missingTable = (error: unknown) =>
  ["42P01", "PGRST205"].includes((error as { code?: string })?.code ?? "");

async function formPerformance(
  db: SupabaseClient,
  organizationId: string,
  clientId: string,
  forms: FormRow[],
  from: string,
  to: string,
) {
  if (!forms.length) return [];
  const admin = accessAdmin();
  const result = [];
  for (let offset = 0; offset < forms.length; offset += batchSize) {
    const batch = forms.slice(offset, offset + batchSize);
    const ids = batch.map((form) => form.id);
    const [views, submissions] = await Promise.all([
      readPages<{ form_id: string; session_id: string }>((start, end) =>
        admin
          .from("atendhub_public_form_events")
          .select("form_id,session_id")
          .in("form_id", ids)
          .eq("event_type", "view")
          .gte("occurred_at", from)
          .lt("occurred_at", to)
          .order("id")
          .range(start, end),
      ).catch((error: unknown) => {
        if (missingTable(error)) return null;
        throw error;
      }),
      readPages<{ form_id: string }>((start, end) =>
        db
          .from("atendhub_leads")
          .select("form_id")
          .eq("organization_id", organizationId)
          .eq("client_id", clientId)
          .in("form_id", ids)
          .eq("capture_status", "completed")
          .not("idempotency_key", "is", null)
          .gte("original_captured_at", from)
          .lt("original_captured_at", to)
          .order("id")
          .range(start, end),
      ),
    ]);
    const sessions = new Map<string, Set<string>>();
    for (const { form_id, session_id } of views ?? []) {
      const unique = sessions.get(form_id) ?? new Set();
      unique.add(session_id);
      sessions.set(form_id, unique);
    }
    const submitted = new Map<string, number>();
    for (const { form_id } of submissions)
      submitted.set(form_id, (submitted.get(form_id) ?? 0) + 1);
    result.push(
      ...batch.map((form) => ({
        ...form,
        views: views === null ? null : (sessions.get(form.id)?.size ?? 0),
        submitted: submitted.get(form.id) ?? 0,
      })),
    );
  }
  return result;
}

export async function readClientOverview(
  db: SupabaseClient,
  organizationId: string,
  clientId: string,
  filter: OverviewFilters,
) {
  const from = startOfBrazilDay(filter.from);
  const to = startOfBrazilDay(shiftDay(filter.to, 1));
  const { professional } = filter;
  const appointmentsQuery = (columns: string) =>
    db
      .from("atendhub_appointments")
      .select(columns)
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .neq("status", "cancelled");
  const [leads, appointments, forms] = await Promise.all([
    readPages<OverviewLead>((start, end) => {
      const query = db
        .from("atendhub_leads")
        .select("id,name,stage,created_at,first_response_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, end);
      if (professional === "unassigned")
        return query.is("professional_id", null);
      return professional === "all"
        ? query
        : query.eq("professional_id", professional);
    }),
    readPages<OverviewAppointment>((start, end) => {
      const query = appointmentsQuery(
        "id,lead_id,starts_at,attendance,lead:atendhub_leads(name)",
      )
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at", { ascending: false })
        .order("id")
        .range(start, end);
      if (professional === "unassigned")
        return query.is("professional_id", null);
      return professional === "all"
        ? query
        : query.eq("professional_id", professional);
    }),
    readPages<FormRow>((start, end) => {
      const query = db
        .from("atendhub_forms")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("name")
        .order("id")
        .range(start, end);
      if (professional === "unassigned") return query.is("doctor_id", null);
      return professional === "all"
        ? query
        : query.eq("doctor_id", professional);
    }),
  ]);
  const bookedLeadIds = new Set<string>();
  const handling: number[] = [];
  const performance = formPerformance(
    db,
    organizationId,
    clientId,
    forms,
    from,
    to,
  );
  const cohort = async () => {
    for (let offset = 0; offset < leads.length; offset += batchSize) {
      const ids = leads
        .slice(offset, offset + batchSize)
        .map((lead) => lead.id);
      const [bookings, events] = await Promise.all([
        readPages<Pick<OverviewAppointment, "lead_id">>((start, end) =>
          appointmentsQuery("lead_id")
            .in("lead_id", ids)
            .order("id")
            .range(start, end),
        ),
        readPages<EpisodeEvent>((start, end) =>
          db
            .from("atendhub_inbox_episode_events")
            .select(
              "conversation_id,status,occurred_at,conversation:atendhub_inbox_conversations!inner(created_at)",
            )
            .eq("conversation.organization_id", organizationId)
            .eq("conversation.client_id", clientId)
            .in("conversation.lead_id", ids)
            .order("occurred_at")
            .order("id")
            .range(start, end),
        ).catch((error: unknown) => {
          if (missingTable(error)) return [];
          throw error;
        }),
      ]);
      for (const appointment of bookings)
        bookedLeadIds.add(appointment.lead_id);
      for (const duration of episodeDurations(events)) handling.push(duration);
    }
  };
  const [formResults] = await Promise.all([performance, cohort()]);
  return summarizeClientOverview({
    leads,
    appointments,
    bookedLeadIds,
    forms: formResults,
    handling,
    range: filter,
  });
}
