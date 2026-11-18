// Isolated browser harness: real components, simulated persistence only.
import { useEffect, useState } from "react";
import { ExternalScheduling } from "@/features/clients/components/external-scheduling";
import { ClientAccesses } from "@/features/clients/components/client-accesses";
import { WhatsappSettings } from "@/features/whatsapp/settings";
import { Inbox } from "@/features/inbox/components/inbox";
import { Queue } from "@/features/queue/queue";
import { createRoot } from "react-dom/client";
import { EditorWorkspace } from "@/features/forms/components/editor";
import { makePersistedPathForm } from "./path-fixture";
import { FormsList } from "@/features/forms/components/forms-list";
import { clients } from "@/lib/mocks/fixtures";
import "@/app/globals.css";
let queueOwner: string | null = null;
const queueLead = () => ({
  id: "00000000-0000-4000-8000-000000000123",
  client_id: clients[0].id,
  name: "Lead de teste",
  phone: "",
  source: "form",
  stage: queueOwner ? "in_progress" : "new",
  owner_id: queueOwner,
  owner_name: queueOwner ? "Ana Atendente" : null,
  created_at: new Date().toISOString(),
  capture_status: "completed",
  claimed_at: queueOwner ? new Date().toISOString() : null,
});
const inboxLead = {
  id: "00000000-0000-4000-8000-000000000600",
  name: "Adriele",
  phone: "16999990000",
  clientId: clients[0].id,
  clientName: clients[0].name,
  operationCode: "prescrita",
  operationName: "Prescrita",
  stage: "in_progress",
  connections: [
    {
      id: "00000000-0000-4000-8000-000000000601",
      name: "Recepção",
      phone: "5516900000000",
      status: "connected",
    },
    {
      id: "00000000-0000-4000-8000-000000000602",
      name: "Segunda linha",
      phone: "5516900000001",
      status: "connected",
    },
  ],
};
const inboxConversation = () => ({
  ...JSON.parse(localStorage.getItem("test-started-conversation") ?? "null"),
});
const stored = localStorage.getItem("editor-test-draft");
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/registration")) {
    if (new URLSearchParams(location.search).has("pending-fields"))
      return Response.json({}, { status: 404 });
    if (init?.method === "PATCH") {
      const data = JSON.parse(String(init.body));
      localStorage.setItem("test-registration", JSON.stringify(data));
      return Response.json({ supported: true, canEdit: true, data });
    }
    return Response.json({
      supported: true,
      canEdit: true,
      data: JSON.parse(
        localStorage.getItem("test-registration") ??
          '{"fullName":"","cpf":"","rg":"","birthDate":""}',
      ),
    });
  }
  if (url.endsWith("/value") && url.startsWith("/api/inbox")) {
    if (new URLSearchParams(location.search).has("pending-fields"))
      return Response.json({}, { status: 404 });
    if (init?.method === "PATCH") {
      const value = JSON.parse(String(init.body));
      localStorage.setItem("test-conversation-value", JSON.stringify(value));
      return Response.json({
        supported: true,
        canEdit: true,
        value,
        appointments: [],
      });
    }
    return Response.json({
      supported: true,
      canEdit: true,
      value: JSON.parse(
        localStorage.getItem("test-conversation-value") ?? "null",
      ),
      appointments: [],
    });
  }
  if (url.endsWith("/appointments") && init?.method === "POST")
    return original(input, init);
  if (url.includes("/agenda?"))
    return Response.json({
      settings: { defaultDuration: 30, displayStep: 30 },
      intervals: [],
      appointments: [],
      bookedLeadIds: [],
      canManageAvailability: true,
      capabilities: {
        bookingDetails: !new URLSearchParams(location.search).has(
          "pending-fields",
        ),
      },
    });
  if (url.startsWith("/api/leads/") && !url.endsWith("/claim"))
    return Response.json({
      id: inboxLead.id,
      client_id: inboxLead.clientId,
      name: inboxLead.name,
      phone: inboxLead.phone,
      email: "",
      notes: "",
      stage: "in_progress",
      source: "manual",
      owner_id: "user",
      created_at: new Date().toISOString(),
      queue_entered_at: new Date().toISOString(),
      original_captured_at: null,
      responses: [],
      events: [],
    });
  if (url.endsWith("/scheduling")) {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      localStorage.setItem("test-scheduling", JSON.stringify(body));
      return Response.json({ ...body, canEdit: true });
    }
    return Response.json({
      ...JSON.parse(
        localStorage.getItem("test-scheduling") ?? '{"name":"","url":""}',
      ),
      canEdit: true,
    });
  }
  if (url.includes("/accesses")) {
    const rows = JSON.parse(localStorage.getItem("test-accesses") ?? "[]");
    const base = url.endsWith("/accesses");
    if (init?.method === "POST" && !base)
      return Response.json({ password: "senha-de-teste" });
    if (init?.method === "POST" || init?.method === "PATCH") {
      const { password, ...body } = JSON.parse(String(init.body));
      void password;
      const item = {
        ...body,
        id: base ? crypto.randomUUID() : url.split("/").at(-1),
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(
        "test-accesses",
        JSON.stringify([
          ...rows.filter((r: { id: string }) => r.id !== item.id),
          item,
        ]),
      );
      return Response.json(item);
    }
    if (init?.method === "DELETE") {
      localStorage.setItem(
        "test-accesses",
        JSON.stringify(rows.filter((r: { id: string }) => !url.endsWith(r.id))),
      );
      return Response.json({ ok: true });
    }
    return Response.json(rows);
  }
  if (url === "/api/inbox/assigned-leads")
    return Response.json(
      localStorage.getItem("test-started-conversation") ? [] : [inboxLead],
    );
  if (url === "/api/inbox/conversations") {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const chosen = inboxLead.connections.find(
        (c) => c.id === body.connectionId,
      )!;
      const conversation = {
        id: "00000000-0000-4000-8000-000000000603",
        leadId: inboxLead.id,
        clientId: inboxLead.clientId,
        clientName: inboxLead.clientName,
        operationCode: "prescrita",
        operationName: "Prescrita",
        connection: chosen,
        contactName: inboxLead.name,
        phone: inboxLead.phone,
        stage: "in_progress",
        source: "manual",
        ownerId: "user",
        ownerName: "Ana Atendente",
        mine: true,
        professionalName: null,
        status: "open",
        unreadCount: 0,
        lastMessageAt: null,
        lastMessagePreview: "",
        lastInboundAt: null,
        lastOutboundAt: null,
        createdAt: new Date().toISOString(),
        canSend: true,
        sendBlockedReason: null,
      };
      localStorage.setItem(
        "test-started-conversation",
        JSON.stringify(conversation),
      );
      return Response.json({ id: conversation.id });
    }
    return Response.json(
      localStorage.getItem("test-started-conversation")
        ? [inboxConversation()]
        : [],
    );
  }
  if (url.startsWith("/api/inbox/conversations/") && url.includes("/messages"))
    return Response.json({ messages: [], hasMore: false });
  if (url.startsWith("/api/inbox/conversations/") && url.endsWith("/read"))
    return Response.json({ ok: true });
  if (url.startsWith("/api/whatsapp/connections")) {
    const connections = JSON.parse(
      localStorage.getItem("test-whatsapp") ?? "[]",
    );
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (url === "/api/whatsapp/connections")
        connections.push({
          id: crypto.randomUUID(),
          client_id: body.clientId,
          name: body.name,
          instance_name: "cliente-" + body.name,
          phone: "55" + body.phone.replace(/\D/g, ""),
          status: "awaiting_confirmation",
        });
      else {
        const connection = connections.find((c: { id: string }) =>
          url.endsWith(c.id),
        );
        if (connection)
          connection.status =
            body.action === "confirm"
              ? "confirming"
              : body.action === "delete"
                ? "delete_pending"
                : connection.status;
      }
      localStorage.setItem("test-whatsapp", JSON.stringify(connections));
      if (new URLSearchParams(location.search).has("qr")) {
        const current =
          url === "/api/whatsapp/connections"
            ? connections.at(-1)
            : connections.find((c: { id: string }) => url.endsWith(c.id));
        const connected = body.action === "confirm";
        if (connected) {
          current.status = "connected";
          localStorage.setItem("test-whatsapp", JSON.stringify(connections));
        }
        return Response.json({
          ok: true,
          connectionId: current.id,
          eventId: crypto.randomUUID(),
          kind: "completed",
          status: connected ? "connected" : "awaiting_confirmation",
          message: connected ? "Conexão confirmada." : "QR Code gerado",
          ...(connected
            ? {}
            : {
                qrCode:
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=",
                qrExpiresAt: new Date(Date.now() + 60000).toISOString(),
              }),
        });
      }
      return Response.json({
        ok: true,
        eventId: crypto.randomUUID(),
        connectionId: "00000000-0000-4000-8000-000000000123",
        kind: "received",
        message:
          "Evento recebido pelo n8n. O resultado da Evolution ainda está aguardando confirmação.",
      });
    }
    return Response.json(connections);
  }
  if (url === "/api/settings/calendar") return Response.json(null);
  if (url.endsWith("/claim")) {
    if (new URLSearchParams(location.search).has("denied"))
      return Response.json(
        { error: "Sua conta não tem permissão para assumir este atendimento." },
        { status: 403 },
      );
    queueOwner = "test-user";
    return Response.json(queueLead());
  }
  if (url.startsWith("/api/leads"))
    return Response.json(
      new URLSearchParams(location.search).has("inbox")
        ? [
            {
              ...queueLead(),
              id: inboxLead.id,
              name: inboxLead.name,
              phone: inboxLead.phone,
              client_id: inboxLead.clientId,
            },
          ]
        : [queueLead()],
    );
  if (url.startsWith("/api/clients")) return Response.json(clients);
  if (url.startsWith("/api/forms")) {
    const current = JSON.parse(
      localStorage.getItem("editor-test-draft") ?? "null",
    );
    if (init?.method === "DELETE" || init?.method === "PATCH") {
      if (!current)
        return Response.json({ error: "Não encontrado" }, { status: 404 });
      current.status = init.method === "DELETE" ? "archived" : "draft";
      localStorage.setItem("editor-test-draft", JSON.stringify(current));
      return Response.json({ ok: true });
    }
    if (init?.body) {
      const body = JSON.parse(String(init.body));
      localStorage.setItem("editor-test-draft", JSON.stringify(body.form));
      return Response.json(body.form);
    }
    return Response.json(current ? [current] : []);
  }
  return original(input, init);
};
function EditorHarness() {
  const params = new URLSearchParams(location.search);
  const isAsyncLoad = params.has("async-source");
  const [source, setSource] = useState(() =>
    isAsyncLoad ? undefined : stored ? JSON.parse(stored) : undefined,
  );

  useEffect(() => {
    if (!isAsyncLoad) return;
    const timer = window.setTimeout(() => {
      const persisted = localStorage.getItem("editor-test-draft");
      setSource(persisted ? JSON.parse(persisted) : makePersistedPathForm());
    }, 25);
    return () => window.clearTimeout(timer);
  }, [isAsyncLoad]);

  return <EditorWorkspace client={clients[0]} source={source} />;
}

createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 24 }}>
    {new URLSearchParams(location.search).has("client-access") ? (
      <>
        <ExternalScheduling clientId={clients[0].id} />
        <ClientAccesses clientId={clients[0].id} />
      </>
    ) : new URLSearchParams(location.search).has("inbox") ? (
      <Inbox />
    ) : new URLSearchParams(location.search).has("whatsapp") ? (
      <WhatsappSettings />
    ) : new URLSearchParams(location.search).has("queue") ? (
      <Queue />
    ) : new URLSearchParams(location.search).has("list") ? (
      <FormsList id={clients[0].id} />
    ) : (
      <EditorHarness />
    )}
  </main>,
);
