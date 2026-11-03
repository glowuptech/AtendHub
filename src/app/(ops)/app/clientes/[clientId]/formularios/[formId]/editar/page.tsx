import { FormEditor } from "@/features/forms/components/editor";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; formId: string }>;
}) {
  const p = await params;
  return <FormEditor clientId={p.clientId} formId={p.formId} />;
}
