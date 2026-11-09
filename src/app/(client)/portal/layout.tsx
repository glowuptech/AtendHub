import { Shell } from "@/components/layout/shell";
import { DemoProvider } from "@/components/layout/demo-context";
import { requireAtendhubMembership } from "@/lib/supabase/access";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAtendhubMembership();
  return <DemoProvider><Shell portal={true}>{children}</Shell></DemoProvider>;
}
