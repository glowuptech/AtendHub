"use client";
import useSWR from "swr";
import type { DashboardResponse, DashboardInvestment } from "./metrics";
export function useSystemDashboard(
  range: { from: string; to: string },
  vertical: string,
  clientId: string,
) {
  const query = new URLSearchParams({ ...range, vertical, clientId });
  return useSWR<DashboardResponse>(
    `/api/dashboard/system?${query}`,
    async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.current)
        throw new Error(
          body?.error ?? "Não foi possível carregar o dashboard real.",
        );
      return body;
    },
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      keepPreviousData: false,
    },
  );
}
export async function saveInvestment(
  input: DashboardInvestment | { clientId: string; day: string },
  method: "POST" | "DELETE",
) {
  const r = await fetch("/api/dashboard/investments", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.ok !== true)
    throw new Error(
      body?.error ?? "Não foi possível confirmar o investimento.",
    );
}
