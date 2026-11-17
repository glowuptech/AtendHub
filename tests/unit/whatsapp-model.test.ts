import { expect, it } from "vitest";
import {
  formatPhone,
  phoneSchema,
  createConnectionSchema,
} from "@/features/whatsapp/model";
it("formata oito ou nove dígitos, sem acrescentar um nono dígito", () => {
  expect(formatPhone("1633334444")).toBe("(16) 3333-4444");
  expect(formatPhone("16999994444")).toBe("(16) 99999-4444");
  expect(formatPhone("+5516999994444")).toBe("(16) 99999-4444");
  expect(phoneSchema.parse("(16) 3333-4444")).toBe("1633334444");
});
it("recusa número curto, DDD inválido e cliente sem UUID", () => {
  expect(phoneSchema.safeParse("123").success).toBe(false);
  expect(phoneSchema.safeParse("00999994444").success).toBe(false);
  expect(
    createConnectionSchema.safeParse({
      clientId: "fixture",
      name: "recepcao",
      phone: "16999994444",
      requestId: crypto.randomUUID(),
    }).success,
  ).toBe(false);
});
