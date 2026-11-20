import useSWR from "swr";
import type { AvailabilityInterval } from "./services/intervals";

export type AgendaAppointment = {
  id: string;
  leadId: string;
  leadName: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  service?: {
    description: string;
    amountCents: number | null;
    currency: "BRL";
  };
  status: "awaiting_confirmation" | "confirmed" | "rescheduling" | "cancelled";
  attendance: "unknown" | "present" | "absent";
};

export type Agenda = {
  capabilities?: { bookingDetails?: boolean };
  settings: { defaultDuration: number; displayStep: number };
  intervals: AvailabilityInterval[];
  appointments: AgendaAppointment[];
  bookedLeadIds: string[];
  canManageAvailability: boolean;
};

export async function requestAppointment<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body === undefined) {
    if (typeof body?.error === "string" && body.error.trim())
      throw new Error(body.error);
    if (response.status === 401)
      throw new Error("Sua sessão expirou. Entre novamente no Atend&Hub.");
    if (body === undefined || response.status >= 500)
      throw new Error(
        "A agenda está temporariamente indisponível. Confira o horário atual antes de tentar novamente.",
      );
    throw new Error("Não foi possível concluir a operação da agenda.");
  }
  return body as T;
}

export function useAgenda(
  clientId: string | null,
  professionalId: string | null,
  week: string,
) {
  const key =
    clientId && professionalId
      ? `/api/clients/${clientId}/agenda?${new URLSearchParams({ professionalId, week })}`
      : null;
  const swr = useSWR<Agenda>(
    key,
    (url: string) => requestAppointment<Agenda>(url),
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
    },
  );
  return { ...swr, key };
}

export const saveAvailability = (
  clientId: string,
  body: {
    professionalId: string;
    week: string;
    defaultDuration: number;
    displayStep: number;
    intervals: AvailabilityInterval[];
  },
) =>
  requestAppointment<{ ok: true }>(`/api/clients/${clientId}/agenda`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const createAppointment = (
  clientId: string,
  idempotencyKey: string,
  body: {
    professionalId: string;
    leadId: string;
    day: string;
    time: string;
    duration: number;
    notes: string;
    conversationId?: string;
    personalData?: import("@/features/leads/registration/model").Registration;
    service?: {
      description: string;
      amountCents: number | null;
      currency: "BRL";
    };
  },
) =>
  requestAppointment<{ created: boolean; bookingDetailsSaved?: boolean }>(
    `/api/clients/${clientId}/appointments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );

export type AppointmentChange =
  | { action: "attendance"; attendance: AgendaAppointment["attendance"] }
  | { action: "status"; status: AgendaAppointment["status"]; reason?: string }
  | {
      action: "reschedule";
      day: string;
      time: string;
      duration: number;
      reason?: string;
    };

export const changeAppointment = (id: string, body: AppointmentChange) =>
  requestAppointment<unknown>(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
