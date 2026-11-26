import { ClientProfile } from "@/features/clients/components/clients";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const p = await params;
  return <ClientProfile key={p.clientId} id={p.clientId} />;
}
