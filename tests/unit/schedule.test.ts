import { test, expect } from "vitest";
import { createMockRepositories } from "@/lib/mocks/repositories";
import { clientA, clientB } from "@/lib/mocks/fixtures";
import {
  monday,
  rangeSlots,
  type Booking,
} from "@/features/appointments/services/schedule";
function setup() {
  const r = createMockRepositories();
  const doctor = r.clients.get(clientA).doctors[0].id;
  const lead = r.leads.list(clientA)[0].id;
  const week = "2026-11-09";
  r.schedule.save(clientA, {
    doctorId: doctor,
    week,
    slots: rangeSlots(week, "08:00", "12:00"),
    defaultDuration: 37,
    displayStep: 20,
  });
  const b: Booking = {
    id: crypto.randomUUID(),
    doctorId: doctor,
    leadId: lead,
    day: week,
    time: "08:00",
    duration: 37,
    notes: "",
  };
  return { r, doctor, week, b };
}
test("disponibilidade por médico e semana aceita duração personalizada", () => {
  const { r, doctor, week } = setup();
  expect(monday("2026-11-15")).toBe(week);
  expect(r.schedule.get(clientA, doctor, week).defaultDuration).toBe(37);
  expect(r.schedule.get(clientA, doctor, "2026-11-16").slots).toEqual([]);
  expect(r.schedule.get(clientA, doctor, "2026-11-16").defaultDuration).toBe(
    37,
  );
  expect(() => r.schedule.get(clientB, doctor, week)).toThrow();
  expect(rangeSlots(week, "09:13", "09:37")).toHaveLength(24);
});
test("reservar bloqueia todo intervalo, atualiza repositório compartilhado e evento único", () => {
  const { r, b } = setup();
  const a = r.schedule.book(clientA, b);
  expect(r.appointments.get(clientA, a.id).name).toBe(
    r.leads.get(clientA, b.leadId).name,
  );
  expect(Date.parse(a.endsAt!) - Date.parse(a.scheduledAt)).toBe(37 * 60000);
  expect(r.schedule.book(clientA, b).id).toBe(a.id);
  expect(r.schedule.outbox(clientA)).toHaveLength(1);
  expect(r.schedule.outbox(clientB)).toHaveLength(0);
  expect(() =>
    r.schedule.book(clientA, { ...b, id: crypto.randomUUID(), time: "08:20" }),
  ).toThrow("ocupado");
  expect(
    r.schedule.book(clientA, { ...b, id: crypto.randomUUID(), time: "08:37" }),
  ).toBeTruthy();
});
test("rejeita intervalos parcialmente liberados, IDs cruzados e sobreposições mesmo com outra duração", () => {
  const { r, b } = setup();
  expect(() =>
    r.schedule.book(clientA, { ...b, time: "11:50", duration: 30 }),
  ).toThrow("completo");
  expect(() =>
    r.schedule.book(clientA, { ...b, leadId: r.leads.list(clientB)[0].id }),
  ).toThrow();
  expect(() => r.schedule.book(clientB, b)).toThrow();
  expect(() =>
    r.schedule.save(clientA, {
      doctorId: b.doctorId,
      week: "2026-11-09",
      slots: ["2026-11-16T09:00"],
      defaultDuration: 30,
      displayStep: 30,
    }),
  ).toThrow();
});
