import { CampaignPlanning } from "@/features/paid-media/planning";
import { z } from "zod";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const client = z
    .string()
    .uuid()
    .safeParse((await searchParams).clientId);
  return <CampaignPlanning initialClient={client.data} />;
}
