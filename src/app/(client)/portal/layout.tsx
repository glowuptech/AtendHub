import {
  brandedPortalContext,
  BrandedPortalHeader,
} from "@/features/client-domains/portal";
import { Shell } from "@/components/layout/shell";
import { DemoProvider } from "@/components/layout/demo-context";
import { requireAtendhubMembership } from "@/lib/supabase/access";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAtendhubMembership();
  const context = await brandedPortalContext();
  if (context)
    return (
      <main style={{ maxWidth: 850, margin: "2rem auto", padding: "1.5rem" }}>
        <BrandedPortalHeader name={context.client.name} />
        {children}
      </main>
    );
  return (
    <DemoProvider>
      <Shell portal={true}>{children}</Shell>
    </DemoProvider>
  );
}
