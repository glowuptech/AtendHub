import type { DashboardDataset } from "@/features/system-dashboard/metrics";
export const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
export function dataset(): DashboardDataset {
  return {
    clients: [
      {
        id: a,
        name: "Clínica real de teste",
        vertical: "healthcare",
        status: "active",
      },
      {
        id: b,
        name: "Escritório de teste",
        vertical: "legal",
        status: "inactive",
      },
    ],
    leads: [
      {
        id: "one",
        clientId: a,
        createdAt: "2026-11-03T12:00:00Z",
        stage: "in_progress",
        captureStatus: "completed",
        ownerId: "actor",
        firstResponseAt: "2026-11-03T12:02:00Z",
        claimedAt: "2026-11-03T12:01:00Z",
      },
      {
        id: "two",
        clientId: a,
        createdAt: "2026-11-04T02:59:59Z",
        stage: "new",
        captureStatus: "incomplete",
        ownerId: null,
        firstResponseAt: null,
        claimedAt: null,
      },
      {
        id: "three",
        clientId: b,
        createdAt: "2026-11-03T13:00:00Z",
        stage: "scheduled",
        captureStatus: "completed",
        ownerId: "actor",
        firstResponseAt: null,
        claimedAt: null,
      },
      {
        id: "outside",
        clientId: a,
        createdAt: "2026-11-04T03:00:00Z",
        stage: "new",
        captureStatus: "completed",
        ownerId: null,
        firstResponseAt: null,
        claimedAt: null,
      },
    ],
    appointments: [
      {
        id: "future",
        clientId: a,
        leadId: "one",
        scheduledAt: "2026-11-20T12:00:00Z",
        status: "confirmed",
        attendance: "unknown",
      },
      {
        id: "duplicate-conversion",
        clientId: a,
        leadId: "one",
        scheduledAt: "2026-11-21T12:00:00Z",
        status: "awaiting_confirmation",
        attendance: "unknown",
      },
      {
        id: "cancelled",
        clientId: b,
        leadId: "three",
        scheduledAt: "2026-11-03T12:00:00Z",
        status: "cancelled",
        attendance: "present",
      },
      {
        id: "older-lead",
        clientId: a,
        leadId: "old",
        scheduledAt: "2026-11-03T14:00:00Z",
        status: "confirmed",
        attendance: "absent",
      },
    ],
    forms: [
      { clientId: a, status: "published" },
      { clientId: a, status: "archived" },
    ],
    investments: [],
  };
}
