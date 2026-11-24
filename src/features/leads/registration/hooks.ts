"use client";
import useSWR from "swr";
import { z } from "zod";
import { emptyRegistration, registrationSchema } from "./model";
export const registrationResponseSchema = z.object({
  supported: z.boolean(),
  canEdit: z.boolean(),
  data: registrationSchema,
});
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
export function readRegistrationResponse(body: unknown): RegistrationResponse {
  const parsed = registrationResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      "O servidor não confirmou os dados pessoais. Tente novamente.",
    );
  return parsed.data;
}
export async function featureRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Não foi possível concluir. Tente novamente.",
    );
  return body as T;
}
export function useRegistration(leadId: string | null) {
  return useSWR<RegistrationResponse>(
    leadId ? `/api/leads/${leadId}/registration` : null,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 501)
        return { supported: false, canEdit: false, data: emptyRegistration() };
      const body = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(
          body.error ?? "Não foi possível carregar os dados pessoais.",
        );
      return readRegistrationResponse(body);
    },
    { revalidateOnFocus: false },
  );
}
