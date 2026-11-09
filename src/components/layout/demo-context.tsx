"use client";
import {
  emptyWebhookConfig,
  type WebhookConfig,
} from "@/features/webhooks/config";
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
import { demoScope } from "@/lib/mocks/fixtures";
import { useClients } from "@/features/clients/hooks";
import {
  defaultCalendar,
  type BusinessCalendar,
} from "@/features/queue/calendar";
interface Context {
  webhookConfig: WebhookConfig;
  setWebhookConfig: Dispatch<SetStateAction<WebhookConfig>>;
  teamMembers: import("@/features/team/access").Member[];
  setTeamMembers: Dispatch<
    SetStateAction<import("@/features/team/access").Member[]>
  >;
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
  const [webhookConfig, setWebhookConfig] =
    useState<WebhookConfig>(emptyWebhookConfig);
  const [teamMembers, setTeamMembers] = useState<
    import("@/features/team/access").Member[]
  >([]);
  const [inboxDrafts, setInboxDrafts] = useState<Record<string, string>>({});
  const [inboxLeadId, setInboxLeadId] = useState("");
  const [calendar, setCalendar] = useState<BusinessCalendar>(defaultCalendar);
  const [scope] = useState<ClientScope>(() => structuredClone(demoScope));
  const [repositories] = useState(() => createMockRepositories(scope));
  const [clientId, setClientId] = useState("");
  const { data: authorizedClients } = useClients();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!authorizedClients) return;
    const timer = window.setTimeout(() => {
      const scopedClients = repositories.clients.list(scope);
      const scopedIds = new Set(scopedClients.map((client) => client.id));
      const nextId = authorizedClients.find((client) => scopedIds.has(client.id))?.id ?? scopedClients[0]?.id ?? "";
      setClientId((current) => (current && scopedIds.has(current) ? current : nextId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authorizedClients, repositories, scope]);
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
        webhookConfig,
        setWebhookConfig,
        teamMembers,
        setTeamMembers,
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
