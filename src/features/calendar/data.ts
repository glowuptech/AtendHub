import type { AppointmentMirror } from "@/domain/schemas";
import type { RepositoryRegistry, ClientScope } from "@/domain/contracts";
import { localDay, shiftDay } from "@/features/clients/services/overview";
export const appointmentStatuses = {
  awaiting_confirmation: "A confirmar",
  confirmed: "Confirmado",
  rescheduling: "Em reagendamento",
} as const;
export function appointmentTag(a: AppointmentMirror) {
  if (a.attendance === "present")
    return { id: "present", label: "Compareceu", tone: "success" as const };
  if (a.attendance === "absent")
    return { id: "absent", label: "Não compareceu", tone: "error" as const };
  return {
    id: a.status ?? "unknown",
    label: a.status
      ? appointmentStatuses[a.status]
      : "Confirmação não informada",
    tone:
      a.status === "confirmed"
        ? ("success" as const)
        : a.status === "rescheduling"
          ? ("warning" as const)
          : ("neutral" as const),
  };
}
export function sunday(day: string) {
  return shiftDay(day, -new Date(day + "T12:00:00Z").getUTCDay());
}
export function calendarEntries(
  r: RepositoryRegistry,
  scope: ClientScope,
  week: string,
) {
  const last = shiftDay(week, 6);
  return r.clients
    .list(scope)
    .flatMap((client) =>
      r.appointments
        .list(client.id)
        .filter((a) => {
          const day = localDay(a.scheduledAt);
          return day >= week && day <= last;
        })
        .map((appointment) => ({
          appointment,
          client,
          doctor: client.doctors.find(
            (d) => d.id === r.schedule.doctorId(appointment),
          ),
        })),
    )
    .sort((a, b) =>
      a.appointment.scheduledAt.localeCompare(b.appointment.scheduledAt),
    );
}
export const dayTitle = (day: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(day + "T12:00:00Z"),
  );
export const clockTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
