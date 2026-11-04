import type { Metadata } from "next";
import { DemoProvider } from "@/components/layout/demo-context";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Atend&Hub · Gestão de atendimento",
    template: "%s · Atend&Hub",
  },
  description: "Gestão de atendimento e relacionamento.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
