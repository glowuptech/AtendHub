"use client";
import type { RepositoryRegistry, ClientScope } from "@/domain/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, demoScope } from "@/lib/mocks/fixtures";
interface Context {
  repositories: RepositoryRegistry;
  scope: ClientScope;
  clientId: string;
  setClientId: (id: string) => void;
  revision: number;
  refresh: () => void;
}
const DemoContext = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [scope] = useState<ClientScope>(() => structuredClone(demoScope));
  const [repositories] = useState(() => createMockRepositories(scope));
  const [clientId, setClientId] = useState(clientA);
  const [revision, setRevision] = useState(0);
  return (
    <DemoContext.Provider
      value={{
        repositories,
        scope,
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
