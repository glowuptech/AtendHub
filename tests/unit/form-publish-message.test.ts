import { expect, it, vi } from "vitest";
import { makePersistedPathForm } from "../editor-harness/path-fixture";
import { completionMessage } from "@/features/forms/services/completion";
import { settingsOf } from "@/features/forms/services/settings";
import { saveForm } from "@/features/forms/services/save-form";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/organization-session", () => ({
  sessionOrganizationContext: auth,
}));
vi.mock("@/lib/supabase/organization-admin", () => ({ apiError: vi.fn() }));

it("publicar ativa a versão e substitui o aviso do antigo modelo", async () => {
  const form = makePersistedPathForm();
  const version = form.versions[0];
  version.settings = { ...settingsOf(version.settings), enabled: false };
  version.successMessage =
    "Teste concluído. Nenhum atendimento real foi solicitado.";
  const rpc = vi.fn().mockResolvedValue({ data: { form: {}, versions: [] } });
  auth.mockResolvedValue({
    organizationId: form.organizationId,
    supabase: { rpc },
  });
  const request = new Request("http://localhost/api/forms", {
    method: "POST",
    body: JSON.stringify({ form, publish: true }),
  });
  expect((await saveForm(request))?.status).toBe(201);
  expect(rpc).toHaveBeenCalledWith(
    "atendhub_save_form_version",
    expect.objectContaining({
      p_publish: true,
      p_version: expect.objectContaining({
        successMessage: "Recebemos seu cadastro.",
        settings: expect.objectContaining({ enabled: true }),
      }),
    }),
  );
});

it("preserva a mensagem personalizada da clínica", () => {
  const message = "Entraremos em contato para agendar seu teste.";
  expect(completionMessage(message)).toBe(message);
});
