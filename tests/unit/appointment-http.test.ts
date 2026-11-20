import { afterEach, expect, it, vi } from "vitest";
import { requestAppointment } from "@/features/appointments/hooks";

afterEach(() => vi.unstubAllGlobals());

it("shows a usable message when Preview returns an HTML error", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("This sandbox is unavailable", { status: 503 }),
      ),
  );
  await expect(
    requestAppointment("/api/appointments/confirmations"),
  ).rejects.toThrow("temporariamente indisponível");
});

it("preserves a readable validation error from the agenda API", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Esse horário está ocupado." }, { status: 409 }),
      ),
  );
  await expect(
    requestAppointment("/api/appointments/test", { method: "PATCH" }),
  ).rejects.toThrow("Esse horário está ocupado.");
});

it("uses a readable fallback when the API error is an object", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: { code: "failed" } }, { status: 400 }),
      ),
  );
  await expect(
    requestAppointment("/api/appointments/test", { method: "PATCH" }),
  ).rejects.toThrow("Não foi possível concluir a operação da agenda.");
});
