import type { Lead, AppointmentMirror } from "@/domain/schemas";
import { localDay, shiftDay } from "@/features/clients/services/overview";
export type LeadFilter = "all" | "unbooked" | "recent7" | "recent30";
export function searchBookingLeads(
  leads: Lead[],
  appointments: AppointmentMirror[],
  input: { clientId: string; query: string; filter: LeadFilter; today: string },
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const query = normalize(input.query.trim()),
    phone = query.replace(/\D/g, "");
  const booked = new Set(
    appointments
      .filter((a) => a.clientId === input.clientId)
      .map((a) => a.leadId),
  );
  const first = shiftDay(input.today, input.filter === "recent7" ? -6 : -29);
  return leads
    .filter((lead) => {
      if (lead.clientId !== input.clientId) return false;
      const day = localDay(lead.createdAt);
      if (input.filter === "unbooked" && booked.has(lead.id)) return false;
      if (
        input.filter.startsWith("recent") &&
        (day < first || day > input.today)
      )
        return false;
      const text = normalize(
        [lead.name, lead.contact?.phone, lead.contact?.email]
          .filter(Boolean)
          .join(" "),
      );
      return (
        !query ||
        text.includes(query) ||
        (/^[+\d\s().-]+$/.test(query) &&
          !!phone &&
          (lead.contact?.phone ?? "").replace(/\D/g, "").includes(phone))
      );
    })
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}
