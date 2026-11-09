import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, organizationContext } from "@/lib/supabase/organization-admin";

const calendarSchema = z.object({
  timezone: z.string().min(1).max(80),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  workStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  holidays: z.array(z.iso.date()).default([]),
  exceptions: z.record(z.string(), z.object({ start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable() })).default({}),
}).refine((value) => value.workEnd > value.workStart, "O fim do expediente deve ser posterior ao início.");

export async function GET() {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase.from("atendhub_service_calendars").select("id, organization_id, timezone, weekdays, work_start, work_end, holidays, exceptions, updated_at").eq("organization_id", auth.organizationId).maybeSingle();
  if (error) return apiError(error, 500);
  return NextResponse.json(data ? { ...data, workStart: data.work_start, workEnd: data.work_end } : null);
}

export async function PUT(request: Request) {
  const auth = await organizationContext();
  if ("error" in auth) return auth.error;
  const parsed = calendarSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(new Error(parsed.error.issues[0]?.message ?? "Calendário inválido."));
  const value = parsed.data;
  const { data, error } = await auth.supabase.from("atendhub_service_calendars").upsert({ organization_id: auth.organizationId, timezone: value.timezone, weekdays: value.weekdays, work_start: value.workStart, work_end: value.workEnd, holidays: value.holidays, exceptions: value.exceptions, updated_at: new Date().toISOString() }, { onConflict: "organization_id" }).select("id, organization_id, timezone, weekdays, work_start, work_end, holidays, exceptions, updated_at").single();
  if (error) return apiError(error, error.code === "42501" ? 403 : 500);
  return NextResponse.json({ ...data, workStart: data.work_start, workEnd: data.work_end });
}
