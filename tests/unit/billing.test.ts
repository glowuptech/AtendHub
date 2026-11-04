import { test, expect } from "vitest";
import { BillingSchema, monthlyFeeCents } from "@/domain/billing";
test("mensalidade usa centavos exatos e distingue ausência de zero", () => {
  expect(monthlyFeeCents("")).toBeNull();
  expect(monthlyFeeCents("0")).toBe(0);
  expect(monthlyFeeCents("1500,49")).toBe(150049);
  expect(() => monthlyFeeCents("-10")).toThrow();
  expect(() => monthlyFeeCents("1.005")).toThrow();
});
test("cartão aceita até 12 parcelas sem inferir valor total do contrato", () => {
  expect(
    BillingSchema.parse({ paymentMethod: "credit_card", installments: 12 })
      .monthlyFeeCents,
  ).toBeNull();
  expect(
    BillingSchema.safeParse({ paymentMethod: "credit_card", installments: 13 })
      .success,
  ).toBe(false);
  expect(
    BillingSchema.safeParse({
      paymentMethod: "monthly_boleto",
      installments: 2,
    }).success,
  ).toBe(false);
  expect(
    BillingSchema.safeParse({ paymentMethod: "prepaid_cash" }).success,
  ).toBe(true);
});
