import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import Home from "@/app/page";
import AppHome from "@/app/(ops)/app/page";
import { GET as authCallback } from "@/app/auth/callback/route";
import { afterLoginPath } from "@/features/auth/navigation";

const { redirect, exchangeCodeForSession, updateSession } = vi.hoisted(() => ({
  redirect: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

it("abre a Fila tanto pela raiz do painel quanto pelo endereço antigo do app", async () => {
  Home();
  AppHome();
  expect(redirect.mock.calls).toEqual([["/app/fila"], ["/app/fila"]]);
  const publicRoot = await middleware(
    new NextRequest("https://atendehub.app/"),
  );
  expect(publicRoot?.headers.get("location")).toBe(
    "https://painel.atendehub.app/app/fila",
  );
  const clinicRoot = await middleware(
    new NextRequest("https://clinica.atendehub.app/"),
  );
  expect(clinicRoot?.headers.get("location")).toBe(
    "https://clinica.atendehub.app/portal",
  );
});

it("depois do login preserva a página solicitada e usa a Fila como padrão", async () => {
  const origin = "https://painel.atendehub.app";
  expect(afterLoginPath(null)).toBe("/app/fila");
  expect(afterLoginPath("/app?foo=bar")).toBe("/app/fila?foo=bar");
  expect(afterLoginPath("/app/visao-geral")).toBe("/app/visao-geral");
  expect(afterLoginPath("/")).toBe("/");
  expect(afterLoginPath("/portal/agendamentos")).toBe("/portal/agendamentos");
  expect(afterLoginPath("/login?next=/app/fila")).toBe("/app/fila");
  const result = await authCallback(
    new Request(origin + "/auth/callback?code=abc"),
  );
  expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  expect(result.headers.get("location")).toBe(origin + "/app/fila");
  const unsafe = new URL(origin + "/auth/callback");
  unsafe.searchParams.set("next", "/\n/example.com");
  expect(
    (await authCallback(new Request(unsafe))).headers.get("location"),
  ).toBe(origin + "/app/fila");
});
