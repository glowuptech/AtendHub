import { describe, it, expect } from "vitest";
import { createMockRepositories, ScopeError } from "@/lib/mocks/repositories";
import { clientA, clientB, uid, organizationId } from "@/lib/mocks/fixtures";
import {
  RangeSchema,
  partnershipSummary,
  getClientOverview,
  localDay,
  daysBetween,
} from "@/features/clients/services/overview";
describe("Visão geral da clínica", () => {
  it("aplica datas e profissional a todas as métricas", () => {
    const r = createMockRepositories();
    const a = getClientOverview(r, clientA, {
      from: "2026-10-01",
      to: "2026-11-03",
    });
    expect(a.leads).toHaveLength(3);
    expect(a.views).toBe(200);
    expect(a.submitted).toBe(76);
    expect(a.responseAverage).toBe(9);
    expect(a.converted).toBe(1);
    const b = getClientOverview(
      r,
      clientA,
      { from: "2026-11-03", to: "2026-11-03" },
      uid(41),
    );
    expect(b.leads).toHaveLength(2);
    expect(b.views).toBe(40);
    expect(b.submitted).toBe(17);
    expect(b.responseAverage).toBe(6);
    expect(b.forms).toHaveLength(1);
    expect(() =>
      getClientOverview(
        r,
        clientA,
        { from: "2026-11-01", to: "2026-11-03" },
        uid(43),
      ),
    ).toThrow();
  });
  it("recusa acesso cruzado e períodos inválidos", () => {
    const r = createMockRepositories({ organizationId, clientIds: [clientA] });
    expect(() =>
      getClientOverview(r, clientB, { from: "2026-11-01", to: "2026-11-03" }),
    ).toThrow(ScopeError);
    expect(
      RangeSchema.safeParse({ from: "2026-11-05", to: "2026-11-03" }).success,
    ).toBe(false);
    expect(
      RangeSchema.safeParse({ from: "2020-01-01", to: "2026-11-03" }).success,
    ).toBe(false);
  });
  it("período vazio não fabrica taxas ou tempos; usa dia de São Paulo", () => {
    const d = getClientOverview(createMockRepositories(), clientA, {
      from: "2020-01-01",
      to: "2020-01-02",
    });
    expect(d.leads).toHaveLength(0);
    expect(d.views).toBe(0);
    expect(d.responseAverage).toBeNull();
    expect(d.handlingAverage).toBeNull();
    expect(localDay("2026-11-03T01:00:00Z")).toBe("2026-11-02");
  });
  it("distingue assinatura pendente, prazo vencido e renovação", () => {
    const p = createMockRepositories().clients.get(clientA).partnership;
    expect(partnershipSummary(p).projectDays).toBe(33);
    expect(partnershipSummary(p).contractDays).toBe(36);
    expect(partnershipSummary(p).renewalDays).toBe(25);
    expect(partnershipSummary(p).signatureDays).toBeNull();
    expect(
      partnershipSummary({ ...p, signedOn: null, signatureDueOn: "2026-11-01" })
        .signatureDays,
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
