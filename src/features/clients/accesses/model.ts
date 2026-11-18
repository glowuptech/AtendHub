import { z } from "zod";
export const externalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Informe uma URL HTTPS válida, sem login ou senha no endereço.");
export const schedulingSchema = z.object({
  name: z.string().trim().max(120),
  url: externalUrl,
});
export const accessSchema = z.object({
  label: z.string().trim().min(2).max(120),
  url: externalUrl,
  login: z.string().trim().min(1).max(240),
  password: z.string().max(2048).optional(),
  notes: z.string().max(1000).default(""),
});
export type AccessRecord = {
  id: string;
  label: string;
  url: string;
  login: string;
  notes: string;
  updated_at: string;
};
