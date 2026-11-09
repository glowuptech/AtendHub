import useSWR from "swr";

export type PersistedLead = {
  id: string;
  organization_id: string;
  client_id: string;
  professional_id: string | null;
  contact_id: string | null;
  name: string;
  phone: string;
  email: string;
  source: string;
  capture_status: "in_progress" | "incomplete" | "completed";
  stage: "new" | "in_progress" | "waiting" | "scheduled" | "awaiting_scheduling" | "confirmed" | "rescheduling" | "recovery" | "lost";
  owner_id: string | null;
  form_id: string | null;
  form_version_id: string | null;
  origin_submission_id: string | null;
  field_values: unknown[];
  next_action: string;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  claimed_at: string | null;
  first_response_at: string | null;
  client?: { id: string; name: string; operation_id: string };
  professional?: { id: string; name: string } | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os leads.");
  return body;
};

export function useLead(leadId: string) {
  return useSWR<PersistedLead & { events?: Array<{ id: string; event_type: string; from_stage: string | null; to_stage: string | null; created_at: string }> }>(`/api/leads/${leadId}`, fetcher, { revalidateOnFocus: false });
}

export function useLeads(params: { clientId?: string; search?: string; stage?: string } = {}) {
  const query = new URLSearchParams();
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.search) query.set("search", params.search);
  if (params.stage && params.stage !== "all") query.set("stage", params.stage);
  return useSWR<PersistedLead[]>(`/api/leads${query.size ? `?${query}` : ""}`, fetcher, { revalidateOnFocus: false, refreshInterval: 15000 });
}
