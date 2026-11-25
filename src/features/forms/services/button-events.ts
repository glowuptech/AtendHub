import type { FormStep } from "@/domain/schemas";

export const standardButtonEvents = [
  "AddPaymentInfo",
  "AddToCart",
  "AddToWishlist",
  "CompleteRegistration",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "InitiateCheckout",
  "Purchase",
  "Schedule",
  "Search",
  "StartTrial",
  "SubmitApplication",
  "Subscribe",
  "ViewContent",
];

export function questionStage(step: FormStep) {
  return `pergunta-${step.trackingId ?? step.id}`;
}

export function updateStageUrl(stage: string, action?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("etapa", stage);
  if (action) url.searchParams.set("acao", action);
  else url.searchParams.delete("acao");
  if (url.href !== window.location.href)
    window.history.replaceState(null, "", url);
}
