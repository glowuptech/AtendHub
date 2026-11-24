import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { shiftDay } from "@/features/clients/services/overview";
import {
  appointmentError,
  badRequest,
  startOfBrazilDay,
  weekSchema,
} from "@/features/appointments/server";

type Params = { params: Promise<{ clientId: string }> };

const query = z.object({
  professionalId: z.string().uuid(),
  week: weekSchema,
});
const saveInput = z.object({
  professionalId: z.string().uuid(),
  week: weekSchema,
  defaultDuration: z.number().int().min(1).max(480),
  displayStep: z.number().int().min(5).max(120),
  intervals: z
    .array(
      z.object({
        day: z.iso.date(),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      }),
    )
    .max(500),
});

export async function GET(request: Request, { params }: Params) {
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success)
    return badRequest("Cliente inválido.");
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = query.safeParse({
    professionalId: url.searchParams.get("professionalId"),
    week: url.searchParams.get("week"),
  });
  if (!parsed.success)
    return badRequest(
      parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
    );
  const { professionalId, week } = parsed.data;
  const { supabase, organizationId } = auth;
  const from = startOfBrazilDay(week);
  const to = startOfBrazilDay(shiftDay(week, 7));

  const { data: professional } = await supabase
    .from("atendhub_professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("client_id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!professional)
    return badRequest("Profissional não encontrado neste cliente.", 404);

  const [settings, intervals, weekAppointments, bookedLeads, manages] =
    await Promise.all([
      supabase
        .from("atendhub_professional_schedule_settings")
        .select("default_duration, display_step")
        .eq("professional_id", professionalId)
        .maybeSingle(),
      supabase
        .from("atendhub_availability_intervals")
        .select("day, start_minute, end_minute")
        .eq("professional_id", professionalId)
        .eq("week_start", week)
        .order("day")
        .order("start_minute"),
      supabase
        .from("atendhub_appointments")
        .select(
          "id, lead_id, professional_id, starts_at, ends_at, notes, status, attendance, source",
        )
        .eq("client_id", clientId)
        .eq("professional_id", professionalId)
        .neq("status", "cancelled")
        .lt("starts_at", to)
        .gt("ends_at", from)
        .order("starts_at"),
      supabase
        .from("atendhub_appointments")
        .select("lead_id")
        .eq("client_id", clientId)
        .neq("status", "cancelled")
        .limit(5000),
      supabase.rpc("atendhub_calendar_manages", {
        _org: organizationId,
        _client: clientId,
      }),
    ]);
  const failure =
    settings.error ??
    intervals.error ??
    weekAppointments.error ??
    bookedLeads.error;
  if (failure) return appointmentError(failure);

  const { error: detailsProbeError } = await supabase
    .from("atendhub_service_values")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .limit(1);
  const bookingDetailsReady = !detailsProbeError;
  if (
    detailsProbeError &&
    !["42P01", "PGRST205"].includes(detailsProbeError.code ?? "")
  )
    return appointmentError(detailsProbeError);

  const appointmentIds = (weekAppointments.data ?? []).map(
    (a) => a.id as string,
  );
  const { data: serviceValues, error: serviceError } =
    bookingDetailsReady && appointmentIds.length
      ? await supabase
          .from("atendhub_service_values")
          .select("appointment_id,description,amount_cents,currency")
          .eq("organization_id", organizationId)
          .eq("client_id", clientId)
          .in("appointment_id", appointmentIds)
      : { data: [], error: null };
  if (serviceError) return appointmentError(serviceError);
  const serviceByAppointment = new Map(
    (serviceValues ?? []).map((row) => [
      row.appointment_id as string,
      {
        description: row.description as string,
        amountCents: row.amount_cents as number | null,
        currency: row.currency as "BRL",
      },
    ]),
  );

  const leadIds = [
    ...new Set((weekAppointments.data ?? []).map((a) => a.lead_id)),
  ];
  const leadNames = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from("atendhub_leads")
      .select("id, name")
      .in("id", leadIds);
    for (const lead of leads ?? []) leadNames.set(lead.id, lead.name);
  }

  return NextResponse.json({
    settings: {
      defaultDuration: settings.data?.default_duration ?? 30,
      displayStep: settings.data?.display_step ?? 30,
    },
    intervals: (intervals.data ?? []).map((row) => ({
      day: row.day as string,
      startMinute: row.start_minute as number,
      endMinute: row.end_minute as number,
    })),
    appointments: (weekAppointments.data ?? []).map((row) => ({
      id: row.id as string,
      leadId: row.lead_id as string,
      leadName: leadNames.get(row.lead_id) ?? "Lead",
      professionalId: row.professional_id as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      notes: row.notes as string,
      status: row.status as string,
      attendance: row.attendance as string,
      ...(serviceByAppointment.has(row.id as string)
        ? { service: serviceByAppointment.get(row.id as string) }
        : {}),
    })),
    capabilities: { bookingDetails: bookingDetailsReady },
    bookedLeadIds: [
      ...new Set((bookedLeads.data ?? []).map((row) => row.lead_id as string)),
    ],
    canManageAvailability: manages.data === true,
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success)
    return badRequest("Cliente inválido.");
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = saveInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;
  const { error } = await auth.supabase.rpc("atendhub_save_availability", {
    _client: clientId,
    _professional: input.professionalId,
    _week: input.week,
    _intervals: input.intervals.map((item) => ({
      day: item.day,
      start_minute: item.startMinute,
      end_minute: item.endMinute,
    })),
    _default_duration: input.defaultDuration,
    _display_step: input.displayStep,
  });
  if (error) return appointmentError(error);
  return NextResponse.json({ ok: true });
}
