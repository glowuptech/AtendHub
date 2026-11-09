import { PersistedLeadDetail } from "@/features/leads/components/persisted-lead-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const p = await params;
  return <PersistedLeadDetail id={p.leadId} />;
}
