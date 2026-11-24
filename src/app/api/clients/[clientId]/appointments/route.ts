import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { appointmentError, badRequest } from "@/features/appointments/server";
import { registrationSchema } from "@/features/leads/registration/model";

const input = z
  .object({
    professionalId: z.string().uuid(),
    leadId: z.string().uuid(),
    day: z.iso.date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    duration: z.number().int().min(1).max(480),
    notes: z.string().trim().max(1000).default(""),
    conversationId: z.string().uuid().optional(),
    personalData: registrationSchema.optional(),
    service: z
      .object({
        description: z.string().trim().min(2).max(160),
        amountCents: z.number().int().min(0).max(100000000000).nullable(),
        currency: z.literal("BRL"),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success)
    return badRequest("Cliente inválido.");
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 120
  )
    return badRequest("Idempotency-Key obrigatório.");
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const body = parsed.data;
  const hasBookingContext = Boolean(
    body.conversationId || body.personalData || body.service,
  );
  const rpc = hasBookingContext
    ? await auth.supabase.rpc("atendhub_create_appointment_with_details", {
        _client: clientId,
        _professional: body.professionalId,
        _lead: body.leadId,
        _starts_at: new Date(`${body.day}T${body.time}:00-03:00`).toISOString(),
        _duration: body.duration,
        _notes: body.notes,
        _idempotency_key: idempotencyKey,
        _conversation: body.conversationId ?? null,
        _personal_data: body.personalData ?? null,
        _service: body.service ?? null,
      })
    : await auth.supabase.rpc("atendhub_create_appointment", {
        _client: clientId,
        _professional: body.professionalId,
        _lead: body.leadId,
        _starts_at: new Date(`${body.day}T${body.time}:00-03:00`).toISOString(),
        _duration: body.duration,
        _notes: body.notes,
        _idempotency_key: idempotencyKey,
      });
  if (rpc.error) {
    if (
      hasBookingContext &&
      ["PGRST202", "42883"].includes(rpc.error.code ?? "")
    )
      return badRequest(
        "Os dados adicionais ainda não estão disponíveis no servidor.",
        501,
      );
    return appointmentError(rpc.error);
  }
  const result = rpc.data as {
    created: boolean;
    appointment: { id: string };
    bookingDetailsSaved?: boolean;
  };
  return NextResponse.json(
    hasBookingContext
      ? { ...result, bookingDetailsSaved: result.bookingDetailsSaved === true }
      : result,
    { status: result.created ? 201 : 200 },
  );
}
