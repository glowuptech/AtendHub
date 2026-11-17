import { z } from "zod";
export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}
export function formatPhone(value: string) {
  const n = phoneDigits(value).slice(0, 11);
  if (n.length <= 2) return n ? `(${n}` : "";
  const rest = n.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return `(${n.slice(0, 2)}) ${rest.slice(0, split)}${rest.length > split ? "-" + rest.slice(split) : ""}`;
}
export const phoneSchema = z
  .string()
  .transform(phoneDigits)
  .refine(
    (v) => /^[1-9]\d\d{8,9}$/.test(v),
    "Informe DDD e um número de 8 ou 9 dígitos.",
  );
export const createConnectionSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  phone: phoneSchema,
  requestId: z.string().uuid(),
});
export const actionSchema = z.object({
  action: z.enum(["confirm", "update", "delete", "retry"]),
  phone: phoneSchema.optional(),
  requestId: z.string().uuid(),
});
export type Connection = {
  id: string;
  client_id: string;
  instance_name: string;
  name: string;
  phone: string;
  status: string;
  last_event_id: string;
  updated_at: string;
};
export const statuses: Record<string, string> = {
  awaiting_confirmation: "Aguardando conexão",
  confirming: "Confirmação solicitada",
  updating: "Atualização solicitada",
  delete_pending: "Exclusão solicitada",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Falha na conexão",
  deleted: "Excluído",
};
