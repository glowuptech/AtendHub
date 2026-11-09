import useSWR from "swr";
import type { Client } from "@/domain/schemas";

const fetcher = async (url: string): Promise<Client[]> => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os clientes.");
  return body;
};

export function useClients() {
  return useSWR<Client[]>("/api/clients", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });
}
