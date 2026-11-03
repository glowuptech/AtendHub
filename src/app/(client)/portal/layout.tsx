import { Shell } from "@/components/layout/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Shell portal={true}>{children}</Shell>;
}
