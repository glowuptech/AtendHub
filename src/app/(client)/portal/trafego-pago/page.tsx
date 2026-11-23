import { notFound } from "next/navigation";
import { brandedPortalContext } from "@/features/client-domains/portal";
import { PaidMediaWorkspace } from "@/features/paid-media/workspace";

export default async function Page() {
  const context = await brandedPortalContext();
  if (!context) notFound();
  return <PaidMediaWorkspace clientId={context.client.id} portal />;
}
