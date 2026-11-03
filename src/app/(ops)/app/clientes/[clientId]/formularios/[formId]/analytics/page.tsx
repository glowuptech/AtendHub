import { FormAnalytics } from "@/features/forms/components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; formId: string }>;
}) {
  const p = await params;
  return <FormAnalytics clientId={p.clientId} formId={p.formId} />;
}
