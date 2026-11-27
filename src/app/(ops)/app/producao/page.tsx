import { Production } from "@/features/production/board";
import { stages } from "@/features/paid-media/model";
import { z } from "zod";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; planId?: string; vida?: string }>;
}) {
  const q = await searchParams;
  return (
    <Production
      initialClient={z.uuid().safeParse(q.clientId).data}
      initialPlan={z.uuid().safeParse(q.planId).data}
      initialVida={z.enum(stages).safeParse(q.vida).data}
    />
  );
}
