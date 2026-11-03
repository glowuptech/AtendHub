import { LeadDetail } from "@/features/leads/components/leads";
export default async function Page({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const p = await params;
  return <LeadDetail id={p.leadId} />;
}
