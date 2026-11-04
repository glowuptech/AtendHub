import { test, expect } from "vitest";
import { conversations, leads } from "@/lib/mocks/fixtures";
import {
  contactName,
  lastMessage,
  matchesSearch,
  waitingFor,
} from "@/features/inbox/services/presentation";
import { unavailableAssistant } from "@/features/inbox/services/assistant";
test("espera depende da direção cronológica, não do estágio do lead", () => {
  const c = structuredClone(conversations[0]);
  c.messages = [
    { ...c.messages[0], at: "2026-11-04T12:01:00.000Z" },
    { ...c.messages[1], at: "2026-11-04T12:00:00.000Z" },
  ];
  expect(waitingFor(c)).toBe("reply");
  expect(lastMessage(c)?.direction).toBe("inbound");
  c.messages = [];
  expect(waitingFor(c)).toBe("all");
});
test("busca aceita acentos e telefone formatado sem agrupar identidades", () => {
  expect(matchesSearch("clinica", ["Clínica Horizonte"])).toBe(true);
  expect(matchesSearch("11999998888", ["(11) 99999-8888"])).toBe(true);
  expect(matchesSearch("Ana", ["Outro cliente"])).toBe(false);
  expect(matchesSearch("-", ["Clínica"])).toBe(false);
  const lead = {
    ...leads[0],
    name: "",
    contact: { name: "", phone: "11999998888", email: "" },
  };
  expect(contactName(lead, { ...conversations[0], name: "" })).toBe(
    "11999998888",
  );
});
test("IA desconectada não produz respostas", async () => {
  expect(unavailableAssistant.available).toBe(false);
  await expect(
    unavailableAssistant.ask(
      { conversationId: conversations[0].id, question: "Valor?" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("não conectado");
});
