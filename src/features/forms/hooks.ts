import useSWR from "swr";
import type { FormDefinition } from "@/domain/schemas";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar formulários.");
  return body as FormDefinition[];
};
export function useForms(clientId?: string | null) {
  return useSWR<FormDefinition[]>(clientId ? `/api/forms?clientId=${encodeURIComponent(clientId)}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: false });
}
