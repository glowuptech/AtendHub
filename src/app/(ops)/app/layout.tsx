import { Shell } from "@/components/layout/shell";
import { requireAtendhubMembership } from "@/lib/supabase/access";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAtendhubMembership();
  return <Shell portal={false}>{children}</Shell>;
}
