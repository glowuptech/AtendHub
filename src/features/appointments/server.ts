import { NextResponse } from "next/server";
import { z } from "zod";
import { monday } from "./services/schedule";

const known: Record<string, [number, string]> = {
  APPOINTMENT_CANCELLED: [
    409,
    "Este agendamento está cancelado e não pode ser alterado.",
  ],
  INVALID_CPF: [422, "CPF inválido. Confira os dígitos."],
  INVALID_BIRTH_DATE: [
    422,
    "Informe uma data de nascimento válida, sem data futura.",
  ],
  INVALID_PERSONAL_DATA: [422, "Confira os dados pessoais informados."],
  INVALID_SERVICE: [422, "Confira a descrição e o valor do serviço."],
  CONVERSATION_FORBIDDEN: [
    403,
    "A conversa não pertence ao lead e cliente selecionados.",
  ],
  APPOINTMENT_FORBIDDEN: [
    403,
    "Você não tem permissão para esta ação na agenda.",
  ],
  BOOKING_DETAILS_FORBIDDEN: [
    403,
    "Você não tem permissão para editar os dados deste lead.",
  ],
  APPOINTMENT_NOT_FOUND: [404, "Agendamento não encontrado."],
  AVAILABILITY_FORBIDDEN: [
    403,
    "Você não tem permissão para configurar a disponibilidade.",
  ],
  CLIENT_FORBIDDEN: [403, "Você não tem acesso a este cliente."],
  CROSSES_MIDNIGHT: [422, "A consulta deve terminar no mesmo dia."],
  IDEMPOTENCY_CONFLICT: [
    409,
    "Identificador de agendamento já utilizado com outros dados.",
  ],
  INVALID_DURATION: [422, "Informe uma duração entre 1 e 480 minutos."],
  INVALID_IDEMPOTENCY_KEY: [400, "Chave de idempotência inválida."],
  INVALID_INTERVALS: [
    422,
    "Confira os intervalos de disponibilidade informados.",
  ],
  INVALID_NOTES: [422, "As observações excedem 1000 caracteres."],
  INVALID_PREFERENCES: [422, "Confira a duração padrão e o intervalo visual."],
  INVALID_START: [422, "Horário de início inválido."],
  INVALID_STATE: [422, "Status ou comparecimento inválido."],
  INVALID_WEEK: [422, "Selecione uma semana iniciada na segunda-feira."],
  LEAD_NOT_FOUND: [404, "Lead não encontrado neste cliente."],
  OUTSIDE_AVAILABILITY: [
    409,
    "O intervalo completo precisa estar disponível para este profissional.",
  ],
  PROFESSIONAL_INACTIVE: [409, "Este profissional está inativo."],
  PROFESSIONAL_NOT_FOUND: [404, "Profissional não encontrado neste cliente."],
  SLOT_TAKEN: [409, "Este horário já está ocupado. Escolha outro intervalo."],
};

export function appointmentError(
  error: { message?: string } | null | undefined,
) {
  const key = Object.keys(known).find((code) => error?.message?.includes(code));
  if (key) {
    const [status, message] = known[key];
    return NextResponse.json({ error: message, code: key }, { status });
  }
  return NextResponse.json(
    { error: "Não foi possível concluir a operação da agenda." },
    { status: 500 },
  );
}

export const badRequest = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export const weekSchema = z.iso
  .date()
  .refine(
    (value) => monday(value) === value,
    "Selecione uma semana iniciada na segunda-feira.",
  );

export const startOfBrazilDay = (day: string) =>
  new Date(`${day}T00:00:00-03:00`).toISOString();
