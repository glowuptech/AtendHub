import { z } from "zod";
import { stages } from "@/features/paid-media/model";

export const workflow = {
  art: ["brief", "design", "review", "approval", "implementation", "done"],
  video: [
    "script",
    "record",
    "edit",
    "review",
    "approval",
    "implementation",
    "done",
  ],
} as const;
export const labels = {
  brief: "Briefing",
  design: "Criação",
  script: "Roteiro",
  record: "Gravação",
  edit: "Edição",
  review: "Revisão interna",
  approval: "Aprovação do cliente",
  implementation: "Implementação",
  done: "Concluído",
};
export const taskInput = z
  .object({
    id: z.uuid(),
    client_id: z.uuid(),
    plan_id: z.uuid().nullable(),
    vida: z.enum(stages).nullable(),
    title: z.string().trim().min(1).max(180),
    reference_links: z
      .array(z.url({ protocol: /^https?$/ }).max(2048))
      .max(40)
      .optional(),
    brief: z.string().trim().max(16000),
    kind: z.enum(["art", "video"]),
    priority: z.enum(["normal", "high", "urgent"]),
    review_on: z.iso.date().nullable(),
    launch_on: z.iso.date().nullable(),
  })
  .refine(
    (t) => !t.review_on || !t.launch_on || t.review_on <= t.launch_on,
    "A revisão precisa ocorrer até a implementação.",
  );
export type Task = z.infer<typeof taskInput> & {
  stage: keyof typeof labels;
  owner_id: string | null;
  owner: { display_name: string } | null;
  plan: { name: string } | null;
  revision: number;
};
