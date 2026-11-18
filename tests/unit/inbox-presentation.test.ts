import { test, expect } from "vitest";
import {
  matchesQuick,
  matchesSearch,
  waitingFor,
} from "@/features/inbox/services/presentation";
import { interpretSendResponse } from "@/features/inbox/model";
import type { InboxConversation } from "@/features/inbox/model";

const base = {
  lastInboundAt: null,
  lastOutboundAt: null,
  unreadCount: 0,
} as unknown as InboxConversation;

test("espera depende da direção cronológica, não do estágio do lead", () => {
  expect(
    waitingFor({
      lastInboundAt: "2026-11-04T12:01:00.000Z",
      lastOutboundAt: "2026-11-04T12:00:00.000Z",
    }),
  ).toBe("reply");
  expect(
    waitingFor({
      lastInboundAt: "2026-11-04T12:00:00.000Z",
      lastOutboundAt: "2026-11-04T12:01:00.000Z",
    }),
  ).toBe("customer");
  expect(waitingFor({ lastInboundAt: null, lastOutboundAt: null })).toBe("none");
});

test("filtros rápidos usam não lidas e direção da última mensagem", () => {
  expect(matchesQuick({ ...base, unreadCount: 2 }, "unread")).toBe(true);
  expect(matchesQuick(base, "unread")).toBe(false);
  expect(
    matchesQuick({ ...base, lastInboundAt: "2026-11-04T12:00:00.000Z" }, "reply"),
  ).toBe(true);
  expect(matchesQuick(base, "all")).toBe(true);
});

test("busca aceita acentos e telefone formatado sem agrupar identidades", () => {
  expect(matchesSearch("clinica", ["Clínica Horizonte"])).toBe(true);
  expect(matchesSearch("11999998888", ["(11) 99999-8888"])).toBe(true);
  expect(matchesSearch("Ana", ["Outro cliente"])).toBe(false);
  expect(matchesSearch("-", ["Clínica"])).toBe(false);
});

test("envio só é confirmado com ok=true e messageId do provedor", () => {
  expect(
    interpretSendResponse(true, '[{"Final":{"ok":true,"messageId":"3EB0","status":"sent"}}]'),
  ).toEqual({ outcome: "sent", providerMessageId: "3EB0" });
  expect(interpretSendResponse(true, '{"ok":true}').outcome).toBe("uncertain");
  expect(interpretSendResponse(true, "ok").outcome).toBe("uncertain");
  expect(interpretSendResponse(true, "").outcome).toBe("uncertain");
  expect(
    interpretSendResponse(false, '{"ok":true,"messageId":"x"}').outcome,
  ).toBe("uncertain");
  expect(
    interpretSendResponse(true, '{"ok":true,"messageId":"x","status":"queued"}')
      .outcome,
  ).toBe("uncertain");
  expect(
    interpretSendResponse(false, '{"ok":false,"message":"Sem sessão"}'),
  ).toEqual({ outcome: "failed", reason: "Sem sessão" });
});
