import type { ClientScope, RepositoryRegistry } from "@/domain/contracts";

// The lead assignment is authoritative; conversation.owner may be an old snapshot.
// Until authentication exists, the UI passes the in-memory session's attendant.
export function assignedConversations(
  repositories: RepositoryRegistry,
  scope: ClientScope,
  attendant: string,
) {
  return repositories.clients.list(scope).flatMap((client) => {
    const leads = new Map(
      repositories.leads.list(client.id).map((lead) => [lead.id, lead]),
    );
    return repositories.inbox
      .list(client.id)
      .filter(
        (conversation) => leads.get(conversation.leadId)?.owner === attendant,
      )
      .map((conversation) => ({
        ...conversation,
        owner: attendant,
        client,
        lead: leads.get(conversation.leadId)!,
      }));
  });
}
