"use client";
import type { RepositoryRegistry, ClientScope } from "@/domain/contracts";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, demoScope } from "@/lib/mocks/fixtures";
import {
  defaultCalendar,
  type BusinessCalendar,
} from "@/features/queue/calendar";
interface Context {
  inboxDrafts: Record<string, string>;
  setInboxDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  attendant: string;
  inboxLeadId: string;
  setInboxLeadId: (id: string) => void;
  calendar: BusinessCalendar;
  setCalendar: (value: BusinessCalendar) => void;
  repositories: RepositoryRegistry;
  scope: ClientScope;
  clientId: string;
  setClientId: (id: string) => void;
  revision: number;
  refresh: () => void;
}
const DemoContext = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [inboxDrafts, setInboxDrafts] = useState<Record<string, string>>({});
  const [inboxLeadId, setInboxLeadId] = useState("");
  const [calendar, setCalendar] = useState<BusinessCalendar>(defaultCalendar);
  const [scope] = useState<ClientScope>(() => structuredClone(demoScope));
  const [repositories] = useState(() => createMockRepositories(scope));
  const [clientId, setClientId] = useState(clientA);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      repositories.capture.sweep();
      setRevision((v) => v + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, [repositories]);
  return (
    <DemoContext.Provider
      value={{
        inboxDrafts,
        setInboxDrafts,
        attendant: "Operadora",
        inboxLeadId,
        setInboxLeadId,
        calendar,
        setCalendar,
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
