import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceValueSchema } from "@/features/leads/registration/model";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const responseHeaders = { "Cache-Control": "no-store, private" };
type Auth = Exclude<
  Awaited<ReturnType<typeof sessionOrganizationContext>>,
  { error: unknown }
>;

async function conversationAccess(auth: Auth, conversationId: string) {
  const { data: conversation, error } = await auth.supabase
    .from("atendhub_inbox_conversations")
    .select("id,organization_id,client_id,lead_id")
    .eq("id", conversationId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (error || !conversation)
    return {
      error: NextResponse.json(
        { error: "Conversa não encontrada." },
        { status: 404 },
      ),
    } as const;
  const { data: canView, error: viewError } = await auth.supabase.rpc(
    "atendhub_booking_details_can_access",
    {
      _org: conversation.organization_id,
      _client: conversation.client_id,
      _lead: conversation.lead_id,
      _action: "view",
    },
  );
  if (viewError || canView !== true)
    return {
      error: NextResponse.json(
        { error: "Você não tem acesso a este atendimento." },
        { status: 403 },
      ),
    } as const;
  const { data: canEdit } = await auth.supabase.rpc(
    "atendhub_booking_details_can_access",
    {
      _org: conversation.organization_id,
      _client: conversation.client_id,
      _lead: conversation.lead_id,
      _action: "edit",
    },
  );
  return { conversation, canEdit: canEdit === true } as const;
}

function unavailable(error: { code?: string } | null) {
  return ["42P01", "PGRST205"].includes(error?.code ?? "");
}

async function readEnvelope(
  auth: Auth,
  conversation: {
    id: string;
    organization_id: string;
    client_id: string;
    lead_id: string;
  },
  canEdit: boolean,
) {
  const [
    { data: values, error: valueError },
    { data: appointments, error: appointmentError },
  ] = await Promise.all([
    auth.supabase
      .from("atendhub_service_values")
      .select("id,description,amount_cents,currency,appointment_id,updated_at")
      .eq("conversation_id", conversation.id)
      .order("updated_at", { ascending: false }),
    auth.supabase
      .from("atendhub_appointments")
      .select("id,starts_at,professional_id")
      .eq("organization_id", conversation.organization_id)
      .eq("client_id", conversation.client_id)
      .eq("lead_id", conversation.lead_id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);
  if (unavailable(valueError)) return { unavailable: true as const };
  if (valueError || appointmentError) throw new Error("VALUE_READ_FAILED");
  const value = values?.[0];
  const professionalIds = [
    ...new Set((appointments ?? []).map((row) => row.professional_id)),
  ];
  const { data: professionals } = professionalIds.length
    ? await auth.supabase
        .from("atendhub_professionals")
        .select("id,name")
        .in("id", professionalIds)
    : { data: [] };
  const names = new Map((professionals ?? []).map((row) => [row.id, row.name]));
  return {
    unavailable: false as const,
    body: {
      supported: true,
      canEdit,
      value: value
        ? {
            description: value.description,
            amountCents:
              value.amount_cents == null ? null : Number(value.amount_cents),
            currency: value.currency,
            appointmentId: value.appointment_id,
          }
        : null,
      appointments: (appointments ?? []).map((row) => ({
        id: row.id,
        label: `${row.starts_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(row.starts_at)) : "Agendamento"} · ${names.get(row.professional_id) ?? "Profissional"}`,
      })),
    },
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const conversationId = (await params).id;
  if (!uuid.safeParse(conversationId).success)
    return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const access = await conversationAccess(auth, conversationId);
  if ("error" in access) return access.error;
  try {
    const result = await readEnvelope(
      auth,
      access.conversation,
      access.canEdit,
    );
    if (result.unavailable)
      return NextResponse.json(
        { supported: false, canEdit: false, value: null, appointments: [] },
        { status: 501, headers: responseHeaders },
      );
    return NextResponse.json(result.body, { headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o valor previsto." },
      { status: 500, headers: responseHeaders },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const conversationId = (await params).id;
  if (!uuid.safeParse(conversationId).success)
    return NextResponse.json({ error: "Conversa inválida." }, { status: 400 });
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const access = await conversationAccess(auth, conversationId);
  if ("error" in access) return access.error;
  if (!access.canEdit)
    return NextResponse.json(
      { error: "Você não tem permissão para editar este valor." },
      { status: 403 },
    );
  const parsed = serviceValueSchema
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Confira o serviço e o valor.",
      },
      { status: 400 },
    );
  const input = parsed.data;
  const { conversation } = access;
  if (input.appointmentId) {
    const { data: appointment } = await auth.supabase
      .from("atendhub_appointments")
      .select("id,lead_id,client_id,organization_id")
      .eq("id", input.appointmentId)
      .eq("lead_id", conversation.lead_id)
      .eq("client_id", conversation.client_id)
      .eq("organization_id", conversation.organization_id)
      .maybeSingle();
    if (!appointment)
      return NextResponse.json(
        { error: "Selecione um agendamento deste mesmo lead e cliente." },
        { status: 400 },
      );
  }
  const { data: existingRows, error: existingError } = await auth.supabase
    .from("atendhub_service_values")
    .select("id,appointment_id")
    .eq("conversation_id", conversation.id)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (unavailable(existingError))
    return NextResponse.json(
      { error: "Os valores ainda não estão disponíveis no servidor." },
      { status: 501 },
    );
  if (existingError)
    return NextResponse.json(
      { error: "Não foi possível salvar o valor previsto." },
      { status: 500 },
    );
  const existing = input.appointmentId
    ? existingRows?.find((row) => row.appointment_id === input.appointmentId)
    : existingRows?.find((row) => row.appointment_id === null);
  const payload = {
    organization_id: conversation.organization_id,
    client_id: conversation.client_id,
    lead_id: conversation.lead_id,
    conversation_id: conversation.id,
    appointment_id: input.appointmentId,
    description: input.description,
    amount_cents: input.amountCents,
    currency: input.currency,
    created_by_id: auth.userId,
    updated_at: new Date().toISOString(),
  };
  let writeError;
  if (existing) {
    ({ error: writeError } = await auth.supabase
      .from("atendhub_service_values")
      .update({ ...payload, created_by_id: auth.userId })
      .eq("id", existing.id));
  } else {
    ({ error: writeError } = await auth.supabase
      .from("atendhub_service_values")
      .insert(payload));
  }
  if (writeError)
    return NextResponse.json(
      { error: "Não foi possível salvar o valor previsto." },
      { status: writeError.code === "42501" ? 403 : 500 },
    );
  try {
    const result = await readEnvelope(auth, conversation, true);
    if (result.unavailable)
      return NextResponse.json(
        { error: "Os valores ainda não estão disponíveis no servidor." },
        { status: 501 },
      );
    return NextResponse.json(result.body, { headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível confirmar o valor previsto." },
      { status: 500 },
    );
  }
}
