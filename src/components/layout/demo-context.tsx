"use client";
import type { RepositoryRegistry } from "@/domain/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA } from "@/lib/mocks/fixtures";
interface Context {
  repositories: RepositoryRegistry;
  clientId: string;
  setClientId: (id: string) => void;
  revision: number;
  refresh: () => void;
}
const DemoContext = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [repositories] = useState(() => createMockRepositories());
  const [clientId, setClientId] = useState(clientA);
  const [revision, setRevision] = useState(0);
  return (
    <DemoContext.Provider
      value={{
        repositories,
        clientId,
        setClientId,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw Error("DemoProvider ausente");
  return value;
}
