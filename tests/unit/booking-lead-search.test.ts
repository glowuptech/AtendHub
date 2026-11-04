import { test, expect } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB } from "@/lib/mocks/fixtures";
import { searchBookingLeads } from "@/features/appointments/services/lead-search";
test("busca por nome sem acento e telefone formatado com escopo do cliente", () => {
  const r = createMockRepositories(),
    lead = {
      ...r.leads.list(clientA)[0],
      name: "José Ávila",
      contact: {
        name: "José",
        phone: "(11) 99999-8888",
        email: "jose@example.com",
      },
    };
  for (const query of ["jose avila", "11999998888", "jose@example.com"])
    expect(
      searchBookingLeads([lead, ...r.leads.list(clientB)], [], {
        clientId: clientA,
        query,
        filter: "all",
        today: "2026-11-04",
      }),
    ).toHaveLength(1);
});
test("sem agendamento considera histórico e recentes usam cadastro em São Paulo", () => {
  const r = createMockRepositories(),
    leads = r.leads.list(clientA),
    appointments = r.appointments.list(clientA);
  const unbooked = searchBookingLeads(leads, appointments, {
    clientId: clientA,
    query: "",
    filter: "unbooked",
    today: "2026-11-04",
  });
  expect(
    unbooked.some((l) => appointments.some((a) => a.leadId === l.id)),
  ).toBe(false);
  const sample = [
    { ...leads[0], id: "old", createdAt: "2026-10-28T15:00:00Z" },
    { ...leads[0], id: "recent", createdAt: "2026-10-30T15:00:00Z" },
    { ...leads[0], id: "future", createdAt: "2026-11-05T15:00:00Z" },
  ];
  expect(
    searchBookingLeads(sample, [], {
      clientId: clientA,
      query: "",
      filter: "recent7",
      today: "2026-11-04",
    }).map((l) => l.id),
  ).toEqual(["recent"]);
});
test("500 contatos permanecem pesquisáveis e ordenados", () => {
  const r = createMockRepositories(),
    base = r.leads.list(clientA)[0],
    many = Array.from({ length: 500 }, (_, i) => ({
      ...base,
      id: String(i),
      name: `Contato ${String(i).padStart(3, "0")}`,
    }));
  expect(
    searchBookingLeads(many, [], {
      clientId: clientA,
      query: "Contato 499",
      filter: "all",
      today: "2026-11-04",
    }).map((l) => l.id),
  ).toEqual(["499"]);
});
