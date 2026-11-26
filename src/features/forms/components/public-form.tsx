"use client";
import { useEffect, useRef } from "react";
import { Id, type FormDefinition } from "@/domain/schemas";
import {
  standardButtonEvents,
  updateStageUrl,
} from "../services/button-events";
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
    eventId?: string,
  ) => {
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType, actionId, sessionId, eventId, versionId: version.id }),
      keepalive: true,
    });
  };
  const capture: WizardCapture = {
    progress: () => null,
    view: (input) => {
      const eventId = crypto.randomUUID();
      sendEvent("view", input.sessionId, undefined, eventId);
      if (tracking.pageView) trackFormPixel(tracking.pixelId, "PageView", false, eventId);
    },
    action: (input, actionId) => sendEvent("action", input.sessionId, actionId),
    navigate: (stage, action, stepEvent) => {
      updateStageUrl(stage, action);
      if (!action) return;
      if (tracking.trackStageUrls)
        trackFormPixel(tracking.pixelId, "EtapaFormulario", true);
      if (stage === "concluido" && tracking.lead)
        trackFormPixel(tracking.pixelId, "Lead", false, idempotencyKey.current ?? undefined);
      const name = stepEvent || tracking.buttonEvents?.[action];
      if (
        !name ||
        ["Lead", "PageView"].includes(name) ||
        trackedActions.current.has(action)
      )
        return;
      trackedActions.current.add(action);
      if (tracking.trackStageUrls && name === "EtapaFormulario") return;
      const eventId = (name === "AddToCart" || name === "AddToWishlist") ? crypto.randomUUID() : undefined;
      if (tracking.pixelId && eventId) {
        void fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventType: "buttonConversion", versionId: version.id, action, eventId }),
          keepalive: true,
        }).catch(() => {});
      }
      trackFormPixel(
        tracking.pixelId,
        name,
        !standardButtonEvents.includes(name),
        eventId,
      );
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
