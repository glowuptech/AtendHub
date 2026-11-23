import { z } from "zod";
import { planStage, stages } from "./model";

export const suggestionStage = planStage
  .pick({
    hypothesis: true,
    creative: true,
    destination: true,
    target: true,
    budgetCents: true,
  })
  .partial()
  .strict();
export const assistantAnswer = z.object({
  answer: z.string().trim().min(1).max(8000),
  suggestions: z
    .object({
      ATR: suggestionStage.optional(),
      INT: suggestionStage.optional(),
      DES: suggestionStage.optional(),
      ACA: suggestionStage.optional(),
    })
    .strict()
    .optional(),
});
export type PaidMediaAnswer = z.infer<typeof assistantAnswer>;
export type PaidMediaExchange = {
  id: string;
  mode: string;
  stage: (typeof stages)[number] | null;
  question: string;
  status: "pending" | "answered" | "failed";
  answer: PaidMediaAnswer | null;
  created_at: string;
};
