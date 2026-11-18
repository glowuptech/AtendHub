// Teste comportamental das RPCs de agenda. Executa tudo dentro de uma transação que é revertida.
// Uso: node --env-file-if-exists=/vercel/share/.env.project tests/db/appointments-rpc.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import postgres from "postgres";
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: "require", max: 1, prepare: false });
const migration = fs.readFileSync(new URL("../../supabase/migrations/20261118060000_atendhub_appointments_scheduling.sql", import.meta.url), "utf8");
const asUser = async (tx, id) => { await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated" })}, true)`; await tx`set local role authenticated`; };
const reset = (tx) => tx`reset role`;
const expectError = async (fn, code) => { try { await fn(); } catch (e) { assert.equal(e.message, code, `esperado ${code}, recebido ${e.message}`); return; } assert.fail(`esperado erro ${code}`); };
const ISO = (d) => d.toISOString();
const run = async (tx) => {
  const already = await tx`select to_regclass('public.atendhub_appointments') r`;
  if (!already[0].r) await tx.unsafe(migration);
  const [admin] = await tx`select m.id, m.organization_id org from atendhub_team_members m where m.role='super_admin' and m.status='active' limit 1`;
  const [prof] = await tx`select id, client_id from atendhub_professionals where organization_id=${admin.org} and status='active' limit 1`;
  const [lead] = await tx`select id from atendhub_leads where organization_id=${admin.org} and client_id=${prof.client_id} limit 1`;
  assert.ok(admin && prof && lead, "dados base ausentes");
  // segunda-feira futura
  const base = new Date(); base.setUTCDate(base.getUTCDate() + ((8 - base.getUTCDay()) % 7 || 7) + 14);
  const week = base.toISOString().slice(0, 10);
  const day = (n) => new Date(Date.parse(week + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const at = (n, hhmm) => new Date(`${day(n)}T${hhmm}:00-03:00`);
  await asUser(tx, admin.id);
  const save = (intervals, w = week) => tx`select public.atendhub_save_availability(${prof.client_id}, ${prof.id}, ${w}::date, ${tx.json(intervals)}, 30, 30)`;
  await expectError(() => tx.savepoint((s) => s`select public.atendhub_save_availability(${prof.client_id}, ${prof.id}, ${day(1)}::date, ${s.json([])}, 30, 30)`), "INVALID_WEEK");
  await expectError(() => tx.savepoint((s) => s`select public.atendhub_save_availability(${prof.client_id}, ${prof.id}, ${week}::date, ${s.json([{ day: "2000-01-01", start_minute: 480, end_minute: 600 }])}, 30, 30)`), "INVALID_INTERVALS");
  // intervalos sobrepostos/adjacentes devem ser mesclados
  await save([{ day: day(0), start_minute: 480, end_minute: 600 }, { day: day(0), start_minute: 540, end_minute: 720 }, { day: day(0), start_minute: 720, end_minute: 780 }, { day: day(1), start_minute: 0, end_minute: 1440 }]);
  const merged = await tx`select day::text, start_minute, end_minute from atendhub_availability_intervals where professional_id=${prof.id} and week_start=${week}::date order by day, start_minute`;
  assert.deepEqual(merged.map((r) => [r.day, r.start_minute, r.end_minute]), [[day(0), 480, 780], [day(1), 0, 1440]]);
  const create = (key, when, dur = 30, notes = "t") => tx`select public.atendhub_create_appointment(${prof.client_id}, ${prof.id}, ${lead.id}, ${ISO(when)}::timestamptz, ${dur}, ${notes}, ${key})`;
  const key1 = "teste-idem-0001";
  const [{ atendhub_create_appointment: first }] = await create(key1, at(0, "09:00"));
  assert.equal(first.created, true);
  const [{ atendhub_create_appointment: again }] = await create(key1, at(0, "09:00"));
  assert.equal(again.created, false);
  assert.equal(again.appointment.id, first.appointment.id);
  await expectError(() => tx.savepoint(() => create(key1, at(0, "10:00"))), "IDEMPOTENCY_CONFLICT");
  const count = await tx`select count(*)::int c from atendhub_appointment_notifications where appointment_id=${first.appointment.id}`;
  assert.equal(count[0].c, 1, "uma notificação por agendamento");
  await expectError(() => tx.savepoint(() => create("teste-idem-0002", at(0, "09:15"))), "SLOT_TAKEN");
  await expectError(() => tx.savepoint(() => create("teste-idem-0003", at(2, "09:00"))), "OUTSIDE_AVAILABILITY");
  await expectError(() => tx.savepoint(() => create("teste-idem-0004", at(0, "12:45"))), "OUTSIDE_AVAILABILITY");
  await expectError(() => tx.savepoint(() => create("teste-idem-0005", at(1, "23:45"), 30)), "CROSSES_MIDNIGHT");
  const [{ atendhub_create_appointment: adjacent }] = await create("teste-idem-0006", at(0, "09:30"));
  assert.equal(adjacent.created, true, "agendamentos adjacentes são permitidos");
  // remarcar libera a ocupação antiga
  const [{ atendhub_reschedule_appointment: moved }] = await tx`select public.atendhub_reschedule_appointment(${first.appointment.id}, ${ISO(at(0, "11:00"))}::timestamptz, 30, 'teste')`;
  assert.equal(new Date(moved.appointment.starts_at).getTime(), at(0, "11:00").getTime());
  const [{ atendhub_create_appointment: reuse }] = await create("teste-idem-0007", at(0, "09:00"));
  assert.equal(reuse.created, true, "horário antigo liberado após remarcar");
  // cancelar libera
  await tx`select public.atendhub_update_appointment_state(${reuse.appointment.id}, 'cancelled', null, 'teste')`;
  const [{ atendhub_create_appointment: afterCancel }] = await create("teste-idem-0008", at(0, "09:00"));
  assert.equal(afterCancel.created, true, "horário liberado após cancelar");
  await expectError(() => tx.savepoint(() => tx`select public.atendhub_update_appointment_state(${reuse.appointment.id}, 'confirmed', null, null)`), "APPOINTMENT_CANCELLED");
  await tx`select public.atendhub_update_appointment_state(${afterCancel.appointment.id}, 'confirmed', 'present', null)`;
  const events = await tx`select event_type from atendhub_appointment_events where appointment_id=${afterCancel.appointment.id} order by created_at`;
  assert.ok(events.length >= 2, "histórico registrado");
  // escrita direta é bloqueada para authenticated
  await expectError(() => tx.savepoint((s) => s`insert into atendhub_appointments (organization_id, client_id, professional_id, lead_id, starts_at, ends_at, created_by_id) values (${admin.org}, ${prof.client_id}, ${prof.id}, ${lead.id}, now(), now() + interval '30 minutes', ${admin.id})`), "permission denied for table atendhub_appointments");
  // anon não lê
  await reset(tx);
  await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`; await tx`set local role anon`;
  await expectError(() => tx.savepoint((s) => s`select count(*) from atendhub_appointments`), "permission denied for table atendhub_appointments");
  await reset(tx);
  console.log("RPCs de agenda: todos os cenários passaram");
};
try { await sql.begin(async (tx) => { await run(tx); throw new Error("__ROLLBACK__"); }); }
catch (e) { if (e.message !== "__ROLLBACK__") { console.error("FALHOU:", e.message, e.stack?.split("\n").slice(0,6).join("\n")); process.exitCode = 1; } else console.log("(transação revertida)"); }
await sql.end();
