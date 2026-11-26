import {
  validateAnswer,
  type CustomFieldDefinition,
  type FieldValue,
} from "@/domain/schemas";

export const phoneHint =
  "Informe o DDD e um telefone de 8 ou 9 dígitos, como (11) 3456-7890 ou (11) 98765-4321.";

// DDDs brasileiros em uso no plano de numeração da Anatel.
const areaCode =
  /^(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|[89][1-9])$/;

export function normalizeFormPhone(value: string) {
  const match =
    /^(?:\+?55\s*)?(?:\((\d{2})\)|(\d{2}))\s*(\d{4,5})-?(\d{4})$/.exec(
      value.trim(),
    );
  if (!match) return null;
  const ddd = match[1] ?? match[2];
  return areaCode.test(ddd) ? `+55${ddd}${match[3]}${match[4]}` : null;
}

export function validateFormAnswer(
  field: CustomFieldDefinition,
  required: boolean,
  value: FieldValue | undefined,
) {
  if (field.type === "phone" && value != null && value !== "") {
    const phone = typeof value === "string" && normalizeFormPhone(value);
    if (!phone) throw new Error(phoneHint);
    return phone;
  }
  validateAnswer(field, required, value);
  return value;
}
