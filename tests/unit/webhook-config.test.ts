import { test, expect } from "vitest";
import {
  emptyWebhookConfig,
  WebhookConfigSchema,
  webhookDestinations,
} from "@/features/webhooks/config";
test("cinco destinos independentes e vazios permitidos", () => {
  expect(webhookDestinations).toHaveLength(5);
  expect(
    WebhookConfigSchema.parse({
      ...emptyWebhookConfig(),
      forms: " https://example.com/forms ",
      assistant: "https://example.com/ai",
    }),
  ).toEqual({
    ...emptyWebhookConfig(),
    forms: "https://example.com/forms",
    assistant: "https://example.com/ai",
  });
  expect(WebhookConfigSchema.parse(emptyWebhookConfig())).toEqual(
    emptyWebhookConfig(),
  );
});
test("rejeita URL inválida, credenciais, fragmento e protocolo inseguro", () => {
  for (const value of [
    "abc",
    "http://example.com",
    "javascript:alert(1)",
    "https://user:password@example.com/hook",
    "https://example.com/#secret",
  ])
    expect(
      WebhookConfigSchema.safeParse({
        ...emptyWebhookConfig(),
        appointments: value,
      }).success,
    ).toBe(false);
});
