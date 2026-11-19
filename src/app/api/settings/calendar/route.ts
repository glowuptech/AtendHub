import { NextResponse } from "next/server";
import { PersistedCalendarSchema } from "@/features/queue/calendar";
import { apiError } from "@/lib/supabase/organization-admin";

import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export async function GET() {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("atendhub_service_calendars")
    .select(
      "id, organization_id, timezone, weekdays, work_start, work_end, holidays, exceptions, updated_at",
    )
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (error) return apiError(error, 500);
  return NextResponse.json(
    data
      ? { ...data, workStart: data.work_start, workEnd: data.work_end }
      : null,
  );
}

export async function PUT(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = PersistedCalendarSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Calendário inválido." },
      { status: 400 },
    );
  const value = parsed.data;
  const { data, error } = await auth.supabase
    .from("atendhub_service_calendars")
    .upsert(
      {
        organization_id: auth.organizationId,
        timezone: value.timezone,
        weekdays: value.days,
        work_start: value.start,
        work_end: value.end,
        holidays: value.holidays,
        exceptions: value.exceptions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    )
    .select(
      "id, organization_id, timezone, weekdays, work_start, work_end, holidays, exceptions, updated_at",
    )
    .single();
  if (error) return apiError(error, error.code === "42501" ? 403 : 500);
  return NextResponse.json({
    ...data,
    workStart: data.work_start,
    workEnd: data.work_end,
  });
}
