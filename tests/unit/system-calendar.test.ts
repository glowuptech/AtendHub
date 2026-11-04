import { test, expect } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB, demoScope } from "@/lib/mocks/fixtures";
import {
  appointmentTag,
  calendarEntries,
  sunday,
} from "@/features/calendar/data";
test("calendário semanal agrega só clientes permitidos e usa domingo local", () => {
  const r = createMockRepositories();
  expect(sunday("2026-11-04")).toBe("2026-11-01");
  const rows = calendarEntries(r, demoScope, "2026-11-01");
  expect(new Set(rows.map((row) => row.client.id))).toEqual(
    new Set([clientA, clientB]),
  );
  expect(
    calendarEntries(
      r,
      { ...demoScope, clientIds: [clientA] },
      "2026-11-01",
    ).every((row) => row.client.id === clientA),
  ).toBe(true);
  expect(calendarEntries(r, demoScope, "2026-11-08")).toEqual([]);
});
test("status do agendamento é independente do estágio do lead e comparecimento tem precedência", () => {
  const r = createMockRepositories(),
    a = r.appointments.list(clientA)[0];
  expect(appointmentTag(a).id).toBe("unknown");
  r.appointments.setStatus(clientA, a.id, "confirmed");
  expect(appointmentTag(r.appointments.get(clientA, a.id)).id).toBe(
    "confirmed",
  );
  r.appointments.setStatus(clientA, a.id, "rescheduling");
  expect(appointmentTag(r.appointments.get(clientA, a.id)).label).toBe(
    "Em reagendamento",
  );
  r.appointments.setAttendance(clientA, a.id, "present");
  expect(appointmentTag(r.appointments.get(clientA, a.id)).label).toBe(
    "Compareceu",
  );
  expect(() => r.appointments.setStatus(clientB, a.id, "confirmed")).toThrow();
});
