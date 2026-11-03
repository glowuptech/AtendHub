import { FormsList } from "@/features/forms/components/forms-list";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const p = await params;
  return <FormsList id={p.clientId} />;
}
