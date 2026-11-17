import type { InboxConnection } from "./model";
export type AssignedInboxLead = {
  id: string;
  name: string;
  phone: string;
  clientId: string;
  clientName: string;
  operationCode: string;
  operationName: string;
  stage: string;
  connections: InboxConnection[];
};
