"use client";
import { useRef } from "react";
import { Id, type FormDefinition } from "@/domain/schemas";
import { FormWizard, type WizardCapture } from "./wizard";

export function PublicForm({
  form,
}: {
  form: FormDefinition & { clinicName: string };
}) {
  const idempotencyKey = useRef<string | null>(null);
  const endpoint = `/api/public/forms/${encodeURIComponent(form.slug)}`;
  const sendEvent = (
    eventType: "view" | "action",
    sessionId: string,
    actionId?: string,
  ) => {
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType, actionId, sessionId }),
      keepalive: true,
    });
  };
  const capture: WizardCapture = {
    progress: () => null,
    view: (input) => sendEvent("view", input.sessionId),
    action: (input, actionId) => sendEvent("action", input.sessionId, actionId),
    capture: async (input) => {
      idempotencyKey.current ??= crypto.randomUUID();
      const query = new URLSearchParams(window.location.search);
      const campaign = query.get("meta_campaign_id");
      const ad = query.get("meta_ad_id");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          idempotencyKey: idempotencyKey.current,
          ...(campaign && { campaign, ad }),
        }),
      });
      const result = await response.json().catch(() => null);
      if (
        !response.ok ||
        result?.ok !== true ||
        result.complete !== input.complete ||
        !Id.safeParse(result.leadId).success
      ) {
        throw new Error(
          result?.error ??
            "Não foi possível confirmar o cadastro. Tente novamente.",
        );
      }
      return result.leadId;
    },
  };
  return (
    <main className="public-page">
      <FormWizard
        form={form}
        version={form.versions[0]}
        fields={form.fields ?? []}
        clinicName={form.clinicName ?? form.name}
        captureRepository={capture}
      />
    </main>
  );
}
