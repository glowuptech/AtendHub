"use client";
import useSWR from "swr";
import {
  defaultCalendar,
  PersistedCalendarSchema,
  type BusinessCalendar,
} from "./calendar";

// Parse once in the fetcher: a stable calendar reference prevents the settings
// editor from resetting its draft on every input/render.
export async function fetchServiceCalendar(
  url: string,
): Promise<BusinessCalendar | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar o calendário.");
  const body = await response.json();
  if (body === null) return null;
  const parsed = PersistedCalendarSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      "O calendário salvo possui dados inválidos. Revise as configurações.",
    );
  return parsed.data;
}
export function useServiceCalendar() {
  const result = useSWR("/api/settings/calendar", fetchServiceCalendar, {
    revalidateOnFocus: true,
  });
  return {
    ...result,
    calendar: result.data ?? defaultCalendar,
    isConfigured: Boolean(result.data),
    isReady: result.data !== undefined && !result.error,
  };
}
