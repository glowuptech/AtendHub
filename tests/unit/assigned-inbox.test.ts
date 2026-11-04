import { test, expect, vi } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { demoScope, clientA, clientB } from "@/lib/mocks/fixtures";
import { assignedConversations } from "@/features/inbox/services/assigned";

test("inbox agrega clientes permitidos e usa a atribuição atual do lead", () => {
  const scope = structuredClone(demoScope),
    r = createMockRepositories(scope);
  const original = r.leads.list.bind(r.leads);
  vi.spyOn(r.leads, "list").mockImplementation((id) =>
    original(id).map((lead, i) => ({
      ...lead,
      owner:
        id === clientA && i === 0
          ? "Outra atendente"
          : id === clientA && i === 1
            ? null
            : "Operadora",
    })),
  );
  const mine = assignedConversations(r, scope, "Operadora");
  expect(new Set(mine.map((c) => c.clientId))).toEqual(
    new Set([clientA, clientB]),
  );
  expect(mine.some((c) => c.leadId === original(clientA)[0].id)).toBe(false);
  expect(mine.some((c) => c.leadId === original(clientA)[1].id)).toBe(false);
  expect(
    assignedConversations(
      r,
      { ...scope, clientIds: [clientA] },
      "Operadora",
    ).every((c) => c.clientId === clientA),
  ).toBe(true);
  expect(assignedConversations(r, scope, "Sem atribuições")).toEqual([]);
});
