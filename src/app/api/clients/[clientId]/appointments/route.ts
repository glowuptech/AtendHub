import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { appointmentError, badRequest } from "@/features/appointments/server";

const input = z.object({
  professionalId: z.string().uuid(),
  leadId: z.string().uuid(),
  day: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(1).max(480),
  notes: z.string().trim().max(1000).default(""),
});

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
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 120)
    return badRequest("Idempotency-Key obrigatório.");
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const body = parsed.data;
  const { data, error } = await auth.supabase.rpc("atendhub_create_appointment", {
    _client: clientId,
    _professional: body.professionalId,
    _lead: body.leadId,
    _starts_at: new Date(`${body.day}T${body.time}:00-03:00`).toISOString(),
    _duration: body.duration,
    _notes: body.notes,
    _idempotency_key: idempotencyKey,
  });
  if (error) return appointmentError(error);
  const result = data as { created: boolean; appointment: { id: string } };
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
