import { afterEach, expect, test, vi } from "vitest";
import { deliverApprovalNotifications } from "@/features/production/approval-notifications";

const { db, update } = vi.hoisted(() => {
  const update = vi.fn();
  return { update, db: { rpc: vi.fn(), from: () => ({ update }) } };
});
vi.mock("@/features/whatsapp/server", () => ({
  integrationAdmin: () => db,
  destinationUrl: (value: string) => new URL(value),
}));
afterEach(() => vi.unstubAllGlobals());

test.each([200, 503])(
  "notifica a versão e registra o resultado HTTP %s",
  async (status) => {
    db.rpc.mockResolvedValue({
      data: [
        {
          id: "version-1",
          task_id: "task-1",
          title: "Arte",
          organization_id: "org",
          client_id: "client",
          requested_at: "2026-11-27",
          slug: "cliente",
          destination: "https://example.com/webhook",
          attempt: 2,
        },
      ],
    });
    const filter = { eq: vi.fn().mockReturnThis() };
    update.mockReturnValue(filter);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    await deliverApprovalNotifications("task-1");
    expect(db.rpc).toHaveBeenCalledWith(
      "atendhub_claim_approval_notifications",
      { p_task: "task-1" },
    );
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers["Idempotency-Key"]).toBe("version-1");
    expect(JSON.parse(options.body)).toMatchObject({
      clientId: "client",
      approvalId: "version-1",
      approvalUrl:
        "https://cliente.atendehub.app/portal/aprovacoes#versao-version-1",
    });
    expect(update.mock.lastCall?.[0]).toEqual(
      status === 200
        ? { notified_at: expect.any(String) }
        : { notify_after: expect.any(String) },
    );
    expect(filter.eq).toHaveBeenCalledWith("notify_attempts", 2);
  },
);
