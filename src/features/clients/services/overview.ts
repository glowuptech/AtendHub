import type { Client } from "@/domain/schemas";
import { daysBetween, localDay, shiftDay } from "@/lib/date-range";

export { daysBetween, localDay, RangeSchema, shiftDay } from "@/lib/date-range";
export type OverviewRange = { from: string; to: string };

export function partnershipSummary(p: Client["partnership"], today: string) {
  return {
    projectDays: p.projectStartedOn
      ? daysBetween(p.projectStartedOn, today)
      : null,
    contractDays: p.signedOn ? daysBetween(p.signedOn, today) : null,
    signatureDays:
      !p.signedOn && p.signatureDueOn
        ? daysBetween(today, p.signatureDueOn)
        : null,
    renewalDays: p.renewsOn ? daysBetween(today, p.renewsOn) : null,
  };
}

export const ratio = (n: number, d: number) =>
  d ? `${Math.round((n / d) * 100)}%` : "N/D";

export type OverviewLead = {
  id: string;
  name: string;
  stage: string;
  created_at: string;
  first_response_at: string | null;
};
export type OverviewAppointment = {
  id: string;
  lead_id: string;
  starts_at: string;
  attendance: "unknown" | "present" | "absent";
  lead?: { name: string } | null;
};
export type FormPerformance = {
  id: string;
  name: string;
  views: number | null;
  submitted: number;
};
export type EpisodeEvent = {
  conversation_id: string;
  status: "open" | "closed";
  occurred_at: string;
  conversation: { created_at: string };
};

function responseMinutes(start: string, end: string | null) {
  if (!end) return null;
  const duration = (Date.parse(end) - Date.parse(start)) / 60000;
  return duration >= 0 ? duration : null;
}

export function episodeDurations(events: EpisodeEvent[]) {
  const starts = new Map<string, string | null>();
  const durations: number[] = [];
  for (const event of events) {
    const { conversation_id: id, status, occurred_at: time } = event;
    if (status === "open") {
      starts.set(id, time);
      continue;
    }
    const start = starts.has(id)
      ? starts.get(id)
      : event.conversation.created_at;
    const minutes = start ? responseMinutes(start, time) : null;
    if (minutes !== null) durations.push(minutes);
    starts.set(id, null);
  }
  return durations;
}

const average = (samples: number[]) =>
  samples.length
    ? samples.reduce((sum, n) => sum + n, 0) / samples.length
    : null;

export function summarizeClientOverview({
  leads,
  appointments,
  bookedLeadIds,
  forms,
  handling,
  range,
}: {
  leads: OverviewLead[];
  appointments: OverviewAppointment[];
  bookedLeadIds: Set<string>;
  forms: FormPerformance[];
  handling: number[];
  range: OverviewRange;
}) {
  const dayCounts = new Map(
    Array.from({ length: daysBetween(range.from, range.to) + 1 }, (_, i) => {
      const day = shiftDay(range.from, i);
      return [day, { day, leads: 0, appointments: 0 }];
    }),
  );
  const stages: Record<string, number> = {};
  const responses: number[] = [];
  for (const lead of leads) {
    const day = dayCounts.get(localDay(lead.created_at));
    if (day) day.leads++;
    stages[lead.stage] = (stages[lead.stage] ?? 0) + 1;
    const minutes = responseMinutes(lead.created_at, lead.first_response_at);
    if (minutes !== null) responses.push(minutes);
  }
  for (const appointment of appointments) {
    const day = dayCounts.get(localDay(appointment.starts_at));
    if (day) day.appointments++;
  }
  return {
    leadCount: leads.length,
    appointmentCount: appointments.length,
    converted: leads.filter((lead) => bookedLeadIds.has(lead.id)).length,
    responded: responses.length,
    responseAverage: average(responses),
    handlingCount: handling.length,
    handlingAverage: average(handling),
    forms,
    views: forms.some((form) => form.views === null)
      ? null
      : forms.reduce((sum, form) => sum + (form.views ?? 0), 0),
    submitted: forms.reduce((sum, form) => sum + form.submitted, 0),
    attendance: {
      present: appointments.filter((a) => a.attendance === "present").length,
      known: appointments.filter(
        (a) => a.attendance === "present" || a.attendance === "absent",
      ).length,
    },
    stages,
    daily: [...dayCounts.values()],
    awaitingResponse: leads
      .filter((lead) => !lead.first_response_at)
      .slice(0, 10)
      .map(({ id, name }) => ({ id, name })),
    recentAppointments: appointments.slice(0, 10),
  };
}

export type ClientOverviewData = ReturnType<typeof summarizeClientOverview>;
