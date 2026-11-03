import { FormPreview } from "@/features/forms/components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; formId: string }>;
}) {
  const p = await params;
  return <FormPreview clientId={p.clientId} formId={p.formId} />;
}
