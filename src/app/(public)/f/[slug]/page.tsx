import { PublicForm } from "@/features/forms/components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PublicForm slug={(await params).slug} />;
}
