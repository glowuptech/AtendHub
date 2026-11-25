import { describe, it, expect } from "vitest";
import { createMockRepositories, ScopeError } from "@/lib/mocks/repositories";
import { clientA, clientB } from "@/lib/mocks/fixtures";
import {
  RangeSchema,
  partnershipSummary,
  episodeDurations,
  summarizeClientOverview,
  localDay,
  daysBetween,
} from "@/features/clients/services/overview";
describe("Visão geral da clínica", () => {
  const range = { from: "2026-11-02", to: "2026-11-03" };
  it("separa agendamentos pela data marcada da conversão da coorte de leads", () => {
    const data = summarizeClientOverview({
      range,
      leads: [
        {
          id: "lead-1",
          name: "Contato",
          stage: "confirmed",
          created_at: "2026-11-03T01:00Z",
          first_response_at: "2026-11-03T01:10Z",
        },
      ],
      appointments: [
        {
          id: "a1",
          lead_id: "outro-lead",
          starts_at: "2026-11-03T15:00Z",
          attendance: "present",
        },
      ],
      bookedLeadIds: new Set(["lead-1"]),
      handling: [15, 5],
      forms: [{ id: "form-1", name: "Captação", views: 8, submitted: 2 }],
    });
    expect(data).toMatchObject({
      leadCount: 1,
      appointmentCount: 1,
      converted: 1,
      views: 8,
      submitted: 2,
      attendance: { present: 1, known: 1 },
      responseAverage: 10,
      handlingAverage: 10,
      stages: { confirmed: 1 },
      daily: [
        { day: "2026-11-02", leads: 1, appointments: 0 },
        { day: "2026-11-03", leads: 0, appointments: 1 },
      ],
    });
  });
  it("só mede intervalos de atendimento encerrados e conta reaberturas separadamente", () => {
    const base = {
      conversation_id: "c1",
      conversation: { created_at: "2026-11-03T12:00Z" },
    };
    expect(
      episodeDurations([
        { ...base, status: "closed", occurred_at: "2026-11-03T12:10Z" },
        { ...base, status: "open", occurred_at: "2026-11-03T13:00Z" },
        { ...base, status: "closed", occurred_at: "2026-11-03T13:05Z" },
        { ...base, status: "open", occurred_at: "2026-11-03T14:00Z" },
      ]),
    ).toEqual([10, 5]);
  });
  it("período vazio não fabrica taxas ou tempos e usa dia de São Paulo", () => {
    const data = summarizeClientOverview({
      range,
      leads: [],
      appointments: [],
      handling: [],
      forms: [],
      bookedLeadIds: new Set(),
    });
    expect(data).toMatchObject({
      leadCount: 0,
      views: 0,
      responseAverage: null,
      handlingAverage: null,
    });
    expect(localDay("2026-11-03T01:00:00Z")).toBe("2026-11-02");
    expect(
      RangeSchema.safeParse({ from: "2026-11-05", to: "2026-11-03" }).success,
    ).toBe(false);
    expect(
      RangeSchema.safeParse({ from: "2020-01-01", to: "2026-11-03" }).success,
    ).toBe(false);
  });
  it("distingue assinatura pendente, prazo vencido e renovação", () => {
    const p = createMockRepositories().clients.get(clientA).partnership;
    expect(partnershipSummary(p, "2026-11-03").projectDays).toBe(33);
    expect(partnershipSummary(p, "2026-11-03").contractDays).toBe(36);
    expect(partnershipSummary(p, "2026-11-03").renewalDays).toBe(25);
    expect(partnershipSummary(p, "2026-11-03").signatureDays).toBeNull();
    expect(
      partnershipSummary(
        { ...p, signedOn: null, signatureDueOn: "2026-11-01" },
        "2026-11-03",
      ).signatureDays,
    ).toBe(-2);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });
  it("salva alterações de cadastro sem modificar IDs/escopos, e rejeita datas incoerentes", () => {
    const r = createMockRepositories(),
      c = r.clients.get(clientA);
    r.clients.update(clientA, {
      ...c,
      name: "Clínica revisada DEMO",
      address: { ...c.address, city: "Cidade Teste" },
    });
    expect(r.clients.get(clientA).address.city).toBe("Cidade Teste");
    expect(createMockRepositories().clients.get(clientA).name).not.toBe(
      "Clínica revisada DEMO",
    );
    expect(() => r.clients.update(clientA, { ...c, id: clientB })).toThrow(
      ScopeError,
    );
    expect(() =>
      r.clients.update(clientA, {
        ...c,
        partnership: { ...c.partnership, renewsOn: "2026-09-01" },
      }),
    ).toThrow();
    expect(() => r.clients.update(clientA, { ...c, doctors: [] })).toThrow(
      "histórico",
    );
  });
});
