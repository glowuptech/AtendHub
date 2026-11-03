import { FormEditor } from "@/features/forms/components/editor";
export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  return <FormEditor clientId={(await params).clientId} />;
}
