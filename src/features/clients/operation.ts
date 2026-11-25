import type { Client } from "@/domain/schemas";

export const clientCategories = {
  organization: "Organização",
  clinic: "Clínica",
  doctor_male: "Médico",
  doctor_female: "Médica",
  law_firm: "Escritório de advocacia",
  lawyer: "Advogado(a)",
} satisfies Record<Client["category"], string>;

export const clientOperations = {
  healthcare: {
    code: "prescrita",
    name: "Glow Up",
    professionalType: "health",
    categories: ["clinic", "doctor_male", "doctor_female", "organization"],
  },
  legal: {
    code: "veredite",
    name: "Veredit",
    professionalType: "legal",
    categories: ["law_firm", "lawyer", "organization"],
  },
} as const satisfies Record<
  Client["vertical"],
  {
    code: string;
    name: string;
    professionalType: string;
    categories: readonly Client["category"][];
  }
>;

export function clientCategory(client: Pick<Client, "vertical" | "category">) {
  const categories: readonly Client["category"][] =
    clientOperations[client.vertical].categories;
  return categories.includes(client.category)
    ? client.category
    : categories[0]!;
}

export const databaseClientStatus = (status: Client["status"]) =>
  status === "paused" ? "inactive" : "active";

export function operationName(code: string, storedName: string) {
  const operation = Object.values(clientOperations).find(
    (item) => item.code === code,
  );
  return operation?.name ?? (storedName || code);
}
