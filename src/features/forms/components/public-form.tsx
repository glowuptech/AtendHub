"use client";
import { useEffect, useRef } from "react";
import { Id, type FormDefinition } from "@/domain/schemas";
import { settingsOf } from "../services/settings";
import { initializeFormPixel, trackFormPixel } from "../services/meta-pixel";
import { FormWizard, type WizardCapture } from "./wizard";

export function PublicForm({
  form,
}: {
  form: FormDefinition & { clinicName: string };
}) {
  const idempotencyKey = useRef<string | null>(null);
  const version = form.versions[0];
  const { tracking } = settingsOf(version.settings);
  const trackedActions = useRef(new Set<string>());
  useEffect(() => {
    initializeFormPixel(tracking.pixelId);
  }, [tracking.pixelId]);
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
    view: (input) => {
      sendEvent("view", input.sessionId);
      if (tracking.pageView) trackFormPixel(tracking.pixelId, "PageView");
    },
    action: (input, actionId) => {
      sendEvent("action", input.sessionId, actionId);
      const name = version.steps.find(
        (step) => step.actionId === actionId,
      )?.metaEvent;
      if (
        !name ||
        name === "Lead" ||
        name === "PageView" ||
        trackedActions.current.has(actionId)
      )
        return;
      trackedActions.current.add(actionId);
      trackFormPixel(tracking.pixelId, name, true);
    },
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
      if (input.complete && tracking.lead)
        trackFormPixel(tracking.pixelId, "Lead");
      return result.leadId;
    },
  };
  return (
    <main className="public-page">
      <FormWizard
        form={form}
        version={version}
        fields={form.fields ?? []}
        clinicName={form.clinicName ?? form.name}
        captureRepository={capture}
      />
    </main>
  );
}
