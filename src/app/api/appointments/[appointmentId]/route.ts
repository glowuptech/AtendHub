import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { appointmentError, badRequest } from "@/features/appointments/server";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("attendance"),
    attendance: z.enum(["unknown", "present", "absent"]),
  }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["awaiting_confirmation", "confirmed", "rescheduling", "cancelled"]),
    reason: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("reschedule"),
    day: z.iso.date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    duration: z.number().int().min(1).max(480),
    reason: z.string().trim().max(500).default(""),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  const { appointmentId } = await params;
  if (!z.string().uuid().safeParse(appointmentId).success)
    return badRequest("Agendamento inválido.");
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const body = parsed.data;
  const { data, error } =
    body.action === "reschedule"
      ? await auth.supabase.rpc("atendhub_reschedule_appointment", {
          _appointment: appointmentId,
          _starts_at: new Date(`${body.day}T${body.time}:00-03:00`).toISOString(),
          _duration: body.duration,
          _reason: body.reason,
        })
      : await auth.supabase.rpc("atendhub_update_appointment_state", {
          _appointment: appointmentId,
          _status: body.action === "status" ? body.status : null,
          _attendance: body.action === "attendance" ? body.attendance : null,
          _reason: body.action === "status" ? body.reason : null,
        });
  if (error) return appointmentError(error);
  return NextResponse.json(data);
}
