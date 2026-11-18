import { expect, it } from "vitest";
import {
  validCpf,
  maskCpf,
  registrationSchema,
  parseAmount,
  prepareBookingDetails,
  serviceValueSchema,
} from "@/features/leads/registration/model";
it("valida CPF e data sem transformar informação inválida em campo vazio", () => {
  expect(validCpf("529.982.247-25")).toBe(true);
  expect(validCpf("11111111111")).toBe(false);
  expect(validCpf("52998224724")).toBe(false);
  expect(maskCpf("52998224725")).toBe("529.982.247-25");
  expect(
    registrationSchema.safeParse({
      fullName: "Nome teste",
      cpf: "abc",
      rg: "",
      birthDate: "",
    }).success,
  ).toBe(false);
  expect(
    registrationSchema.safeParse({
      fullName: "Nome teste",
      cpf: "",
      rg: "",
      birthDate: "2999-01-01",
    }).success,
  ).toBe(false);
});
it("valor em reais é convertido para centavos sem confundir vazio com zero", () => {
  expect(parseAmount("3.500,25")).toBe(350025);
  expect(parseAmount("R$ 350,00")).toBe(35000);
  expect(parseAmount("350.25")).toBe(35025);
  expect(parseAmount("0,00")).toBe(0);
  expect(parseAmount("")).toBe(null);
  expect(() => parseAmount("-10")).toThrow();
  expect(() => parseAmount("10,999")).toThrow();
});
it("monta detalhes de reserva sem campos artificiais e exige o serviço ao informar valor", () => {
  expect(prepareBookingDetails({})).toEqual({});
  expect(
    prepareBookingDetails({ serviceName: "Consulta", amountInput: "350,00" }),
  ).toEqual({
    service: { description: "Consulta", amountCents: 35000, currency: "BRL" },
  });
  expect(() => prepareBookingDetails({ amountInput: "350,00" })).toThrow();
  expect(
    serviceValueSchema.safeParse({
      description: "Consulta",
      amountCents: 35000,
      currency: "BRL",
      appointmentId: "outro",
    }).success,
  ).toBe(false);
});
