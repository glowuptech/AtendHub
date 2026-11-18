import { z } from "zod";
export const digits = (value: string) => value.replace(/\D/g, "");
export function validCpf(value: string) {
  const n = digits(value);
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  for (let count = 9; count <= 10; count++) {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += Number(n[i]) * (count + 1 - i);
    const check = (sum * 10) % 11;
    if ((check === 10 ? 0 : check) !== Number(n[count])) return false;
  }
  return true;
}
export function maskCpf(value: string) {
  return digits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}
export const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .max(160, "Use até 160 caracteres.")
    .refine((v) => !v || v.length >= 2, "Informe o nome completo."),
  cpf: z
    .string()
    .refine(
      (v) => !v.trim() || validCpf(v),
      "CPF inválido. Confira os dígitos.",
    )
    .transform(digits),
  rg: z.string().trim().max(30, "Use até 30 caracteres no RG."),
  birthDate: z.string().refine(
    (value) =>
      !value ||
      (z.iso.date().safeParse(value).success &&
        value <=
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())),
    "Informe uma data de nascimento válida, sem data futura.",
  ),
});
export type Registration = z.infer<typeof registrationSchema>;
export const emptyRegistration = (): Registration => ({
  fullName: "",
  cpf: "",
  rg: "",
  birthDate: "",
});
export function parseAmount(value: string): number | null {
  let text = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) {
    if (!/^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(text))
      throw new Error("Informe o valor em reais, como 350,00.");
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Informe um valor positivo, com até duas casas decimais.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100000000000)
    throw new Error("Valor fora do limite permitido.");
  return cents;
}
export type BookingDetails = {
  personalData?: Registration;
  service?: {
    description: string;
    amountCents: number | null;
    currency: "BRL";
  };
};

export type BookingDetailsDraft = {
  personalData?: Registration;
  serviceName?: string;
  amountInput?: string;
};
export function prepareBookingDetails(
  value: BookingDetailsDraft,
): BookingDetails {
  const result: BookingDetails = {};
  if (value.personalData)
    result.personalData = registrationSchema.parse(value.personalData);
  if (value.serviceName?.trim() || value.amountInput?.trim()) {
    const description = z
      .string()
      .trim()
      .min(2, "Informe o serviço relacionado ao valor.")
      .max(160, "Use até 160 caracteres.")
      .parse(value.serviceName ?? "");
    result.service = {
      description,
      amountCents: parseAmount(value.amountInput ?? ""),
      currency: "BRL",
    };
  }
  return result;
}

export const serviceValueSchema = z.object({
  description: z
    .string()
    .trim()
    .min(2, "Informe o serviço ou consulta.")
    .max(160, "Use até 160 caracteres."),
  amountCents: z.number().int().min(0).max(100000000000).nullable(),
  currency: z.literal("BRL"),
  appointmentId: z.string().uuid().nullable(),
});

export function validationMessage(
  error: unknown,
  fallback = "Confira os campos.",
) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
  return error instanceof Error ? error.message : fallback;
}
