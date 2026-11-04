import { z } from "zod";
export const BillingSchema = z
  .object({
    monthlyFeeCents: z
      .number()
      .int()
      .min(0)
      .max(100000000000)
      .nullable()
      .default(null),
    currency: z.literal("BRL").default("BRL"),
    paymentMethod: z
      .enum(["monthly_boleto", "credit_card", "prepaid_cash"])
      .nullable()
      .default(null),
    installments: z.number().int().min(1).max(12).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.paymentMethod === "credit_card" && v.installments === null)
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Informe de 1 a 12 parcelas.",
      });
    if (v.paymentMethod !== "credit_card" && v.installments !== null)
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Parcelas se aplicam somente ao cartão.",
      });
  });
export type Billing = z.infer<typeof BillingSchema>;
export function monthlyFeeCents(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text))
    throw Error("Informe a mensalidade com até duas casas decimais.");
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export const paymentLabels = {
  monthly_boleto: "Boleto mensal",
  credit_card: "Cartão de crédito",
  prepaid_cash: "Antecipado à vista",
};
