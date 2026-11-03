import type { Metadata } from "next";
import { DemoProvider } from "@/components/layout/demo-context";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Prescrita · Operação de saúde",
    template: "%s · Prescrita",
  },
  description: "MVP visual com dados fictícios. Integrações não conectadas.",
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
