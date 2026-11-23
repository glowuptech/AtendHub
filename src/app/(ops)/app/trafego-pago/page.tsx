import { PaidMediaWorkspace } from "@/features/paid-media/workspace";
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
  return <PaidMediaWorkspace clientId={client.data} />;
}
