import type { ReactNode } from "react";
import { DemoProvider } from "@/components/layout/demo-context";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
