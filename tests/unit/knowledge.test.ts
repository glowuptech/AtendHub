import { expect, test } from "vitest";
import { KnowledgeEntrySchema } from "../../src/domain/schemas";
const entry = {id:"example", category:"Consultas", question:"Qual o valor?", answer:"", source:"", status:"draft", updatedAt:null, priceCents:null, currency:"BRL", conditions:""};
test("permite pendência sem inventar valor e exige fonte e resposta para aprovação", () => {
  expect(KnowledgeEntrySchema.parse(entry).priceCents).toBeNull();
  expect(KnowledgeEntrySchema.safeParse({...entry,status:"approved"}).success).toBe(false);
  expect(KnowledgeEntrySchema.safeParse({...entry,status:"approved",answer:"Sob consulta",source:"Manual v1"}).success).toBe(true);
});
test("rejeita valores negativos e centavos fracionários", () => {
  for (const priceCents of [-1, 1.5]) expect(KnowledgeEntrySchema.safeParse({...entry,priceCents}).success).toBe(false);
});
