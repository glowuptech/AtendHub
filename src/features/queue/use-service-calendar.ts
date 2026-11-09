"use client";
import useSWR from "swr";
import { defaultCalendar, type BusinessCalendar } from "./calendar";

type PersistedCalendar = { timezone: string; weekdays: number[]; workStart: string; workEnd: string; holidays: string[]; exceptions: Record<string, { start: string | null; end: string | null }> } | null;
const fetcher = async (url: string): Promise<PersistedCalendar> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar o calendário.");
  return response.json();
};
export function useServiceCalendar() {
  const result = useSWR("/api/settings/calendar", fetcher, { revalidateOnFocus: false });
  const persisted = result.data;
  const calendar: BusinessCalendar = persisted ? { start: persisted.workStart, end: persisted.workEnd, days: persisted.weekdays, holidays: persisted.holidays, timezone: persisted.timezone, exceptions: persisted.exceptions } : { ...defaultCalendar, timezone: "America/Sao_Paulo", exceptions: {} };
  return { ...result, calendar, isConfigured: Boolean(persisted) };
}
