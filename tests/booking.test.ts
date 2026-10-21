/*
 * Booking engine tests against a real Postgres database.
 *   DATABASE_URL=... npm test
 * Creates its own test barbers/service (names prefixed "ZZTEST") and removes them afterwards,
 * so it can run against a development database. Do not run against production.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { DateTime } from "luxon";
import { checkSlot, findAlternatives, listSlots, loadDay } from "../lib/availability";
import { BookingError, createAppointment, reschedule, transition, type Actor } from "../lib/booking";
import { pool, q, q1 } from "../lib/db";
import { getSettings } from "../lib/settings";

const admin: Actor = { kind: "user", id: "00000000-0000-0000-0000-000000000000", name: "Test Admin", role: "ADMIN", barberId: null };
let A = "", B = "", C = "", SVC = "", adminUserId = "";
let zone = "Europe/London";
let dateISO = "";
let phoneSeq = 0;
const phone = () => `+44770099${String(1000 + phoneSeq++).padStart(4, "0")}`;
const at = (hhmm: string, d = dateISO) => DateTime.fromISO(`${d}T${hhmm}`, { zone }).toJSDate();
const cust = (n: string) => ({ name: `ZZTEST ${n}`, phone: phone() });

async function online(barberId: string | "any", hhmm: string, d = dateISO) {
  return createAppointment({ serviceId: SVC, barberId, start: at(hhmm, d), customer: cust("online"), source: "ONLINE", status: "PENDING", actor: { kind: "customer" } });
}

async function cleanup() {
  await q(`DELETE FROM appointments WHERE customer_name LIKE 'ZZTEST%' OR barber_id IN (SELECT id FROM barbers WHERE name LIKE 'ZZTEST%')`);
  await q(`DELETE FROM customers WHERE name LIKE 'ZZTEST%'`);
  await q(`DELETE FROM users WHERE email LIKE 'zztest%'`);
  await q(`DELETE FROM barbers WHERE name LIKE 'ZZTEST%'`);
  await q(`DELETE FROM services WHERE name LIKE 'ZZTEST%'`);
}

before(async () => {
  await cleanup();
  const s = await getSettings();
  zone = s.timezone;
  // A weekday at least 5 days ahead (inside the booking horizon, past minimum notice)
  let d = DateTime.now().setZone(zone).plus({ days: 5 }).startOf("day");
  while (d.weekday > 5) d = d.plus({ days: 1 });
  dateISO = d.toISODate()!;
  SVC = (await q1(`INSERT INTO services (name, price_pence, duration_min) VALUES ('ZZTEST Cut', 2000, 30) RETURNING id`))!.id;
  const mk = async (name: string, i: number) => {
    const id = (await q1(`INSERT INTO barbers (name, slug) VALUES ($1, $2) RETURNING id`, [name, `zztest-${i}`]))!.id;
    await q(`INSERT INTO barber_services VALUES ($1, $2)`, [id, SVC]);
    for (let wd = 1; wd <= 7; wd++) await q(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES ($1, $2, '09:00', '19:00')`, [id, wd]);
    await q(`INSERT INTO breaks (barber_id, weekday, start_time, end_time, label) SELECT $1, w, '13:00', '13:30', 'Lunch' FROM generate_series(1,7) w`, [id]);
    return id;
  };
  A = await mk("ZZTEST Barber A", 1);
  B = await mk("ZZTEST Barber B", 2);
  C = await mk("ZZTEST Barber C", 3);
  adminUserId = (await q1(`INSERT INTO users (email, name, password_hash, role) VALUES ('zztest-admin@example.com', 'Test Admin', 'x', 'ADMIN') RETURNING id`))!.id;
  (admin as any).id = adminUserId;
});

after(async () => {
  await cleanup();
  await pool().end();
});

describe("required scenarios", () => {
  test("1. two different barbers can take appointments at the same time", async () => {
    const r1 = await online(A, "10:00");
    const r2 = await online(B, "10:00");
    assert.ok(r1.id && r2.id);
    await transition(r1.id, "approve", admin);
    await transition(r2.id, "approve", admin);
    const rows = await q(`SELECT status FROM appointments WHERE id = ANY($1)`, [[r1.id, r2.id]]);
    assert.deepEqual(rows.map((r) => r.status).sort(), ["CONFIRMED", "CONFIRMED"]);
  });

  test("2. one barber cannot have overlapping appointments (start inside, exact match, and spanning)", async () => {
    // A has 10:00-10:30 (+5 buffer) from test 1
    for (const t of ["10:00", "10:15", "09:45"]) {
      await assert.rejects(online(A, t), (e: any) => e instanceof BookingError && e.code === "UNAVAILABLE" && e.issues.some((i) => i.code === "OVERLAP"), `A at ${t} should be refused`);
    }
  });

  test("buffer time is respected (10:30 refused, 10:35 allowed with 5-min buffer)", async () => {
    const s = await getSettings();
    assert.equal(s.buffer_minutes, 5, "seed sets a 5 minute buffer");
    await assert.rejects(online(A, "10:30"));
    const ok = await online(A, "10:35");
    assert.ok(ok.id);
  });

  test("3. a pending booking blocks its slot for other customers", async () => {
    const p = await online(B, "15:00");
    const row = await q1(`SELECT status, expires_at FROM appointments WHERE id = $1`, [p.id]);
    assert.equal(row!.status, "PENDING");
    assert.ok(row!.expires_at, "pending booking has an approval deadline");
    const ctx = await loadDay(dateISO, { barberIds: [B], serviceId: SVC });
    const slots = listSlots(ctx, 30, [B]);
    assert.ok(!slots.some((s) => s.time === "15:00"), "15:00 must not be offered for B");
    assert.ok(slots.some((s) => s.time === "16:00"), "16:00 still offered for B");
    await assert.rejects(online(B, "15:00"), (e: any) => e.code === "UNAVAILABLE");
  });

  test("4. a rejected booking releases the slot", async () => {
    const existing = await q1(`SELECT id FROM appointments WHERE barber_id = $1 AND status = 'PENDING' AND start_at = $2`, [B, at("15:00")]);
    await transition(existing!.id, "reject", admin, "Fully booked");
    const ctx = await loadDay(dateISO, { barberIds: [B], serviceId: SVC });
    assert.ok(listSlots(ctx, 30, [B]).some((s) => s.time === "15:00"), "15:00 offered again");
    const again = await online(B, "15:00");
    assert.ok(again.id);
  });

  test("5. customer sees other available barbers (and other times) when chosen barber is busy", async () => {
    // A busy at 10:00, B busy at 10:00, C free
    const alt = await findAlternatives({ serviceId: SVC, durationMin: 30, barberId: A, start: at("10:00") });
    const names = alt.otherBarbersAtTime.map((b) => b.name);
    assert.ok(names.includes("ZZTEST Barber C"), "C offered at 10:00");
    assert.ok(!names.includes("ZZTEST Barber B"), "B not offered at 10:00 (busy)");
    assert.ok(alt.sameBarberTimes[0]?.slots.length > 0, "other times for A suggested");
    // The error returned by a failed booking carries these alternatives too
    await assert.rejects(online(A, "10:00"), (e: any) => e.alternatives?.otherBarbersAtTime.some((b: any) => b.id === C));
  });

  test("'Any available barber' assigns a free qualified barber", async () => {
    const r = await online("any", "10:00"); // only C is free at 10:00
    assert.equal(r.barberId, C);
    await assert.rejects(online("any", "10:00"), (e: any) => e.code === "UNAVAILABLE"); // now nobody is
  });

  test("6. admin WhatsApp booking is confirmed immediately and occupies the barber's calendar", async () => {
    const r = await createAppointment({
      serviceId: SVC, barberId: C, start: at("11:00"), customer: cust("whatsapp"), source: "WHATSAPP", status: "CONFIRMED",
      staffNotes: "Customer contacted us through WhatsApp", actor: admin,
    });
    const row = await q1(`SELECT status, source FROM appointments WHERE id = $1`, [r.id]);
    assert.deepEqual({ ...row }, { status: "CONFIRMED", source: "WHATSAPP" });
    const ctx = await loadDay(dateISO, { barberIds: [C], serviceId: SVC });
    assert.ok(ctx.barbers.get(C)!.busy.some((b) => b.id === r.id), "on C's calendar");
    await assert.rejects(online(C, "11:15"), (e: any) => e.code === "UNAVAILABLE", "online customers can't book over it");
  });

  test("7. admin gets a clear conflict error and cannot override an overlap", async () => {
    await assert.rejects(
      createAppointment({ serviceId: SVC, barberId: C, start: at("11:00"), customer: cust("dup"), source: "PHONE", status: "CONFIRMED", overrideSoftRules: true, actor: admin }),
      (e: any) => e.code === "UNAVAILABLE" && /already has a confirmed booking/.test(e.message) && !!e.alternatives,
    );
    // Soft rules (lunch break) need explicit override...
    await assert.rejects(
      createAppointment({ serviceId: SVC, barberId: C, start: at("13:00"), customer: cust("lunch"), source: "PHONE", status: "CONFIRMED", actor: admin }),
      (e: any) => e.issues.some((i: any) => i.code === "BREAK"),
    );
    // ...and work when the admin explicitly overrides.
    const ok = await createAppointment({ serviceId: SVC, barberId: C, start: at("13:00"), customer: cust("lunch"), source: "PHONE", status: "CONFIRMED", overrideSoftRules: true, actor: admin });
    assert.ok(ok.id);
  });
});

describe("integrity and edge cases", () => {
  test("simultaneous requests for the same barber and time: exactly one succeeds", async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => online(A, "16:00")));
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1, `expected 1 success, got ${ok.length}`);
    const n = await q1(`SELECT count(*)::int n FROM appointments WHERE barber_id = $1 AND start_at = $2 AND status IN ('PENDING','CONFIRMED')`, [A, at("16:00")]);
    assert.equal(n!.n, 1);
  });

  test("database refuses overlaps even if application checks are bypassed", async () => {
    const appt = await q1(`SELECT * FROM appointments WHERE barber_id = $1 AND start_at = $2 AND status IN ('PENDING','CONFIRMED')`, [A, at("16:00")]);
    await assert.rejects(
      q(`INSERT INTO appointments (reference, customer_id, barber_id, service_id, customer_name, start_at, end_at, block_end_at, status, price_pence, duration_min, service_name, manage_token_hash)
         VALUES ('BK-RAWTST', $1, $2, $3, 'ZZTEST raw', $4, $5, $5, 'CONFIRMED', 0, 30, 'x', 'x')`,
        [appt.customer_id, A, SVC, at("16:10"), at("16:40")]),
      (e: any) => e.code === "23P01",
    );
  });

  test("an expired pending request releases its slot automatically", async () => {
    const p = await online(B, "17:00");
    await q(`UPDATE appointments SET expires_at = now() - interval '1 minute' WHERE id = $1`, [p.id]);
    const ctx = await loadDay(dateISO, { barberIds: [B], serviceId: SVC });
    assert.ok(listSlots(ctx, 30, [B]).some((s) => s.time === "17:00"), "expired hold not shown as busy");
    const r = await online(B, "17:00");
    assert.ok(r.id);
    assert.equal((await q1(`SELECT status FROM appointments WHERE id = $1`, [p.id]))!.status, "EXPIRED");
    await assert.rejects(transition(p.id, "approve", admin), (e: any) => e.code === "BAD_STATE");
  });

  test("breaks, working hours and duration are used for availability", async () => {
    const ctx = await loadDay(dateISO, { barberIds: [C], serviceId: SVC });
    assert.ok(checkSlot(ctx, C, +at("12:45"), 30).some((i) => i.code === "BREAK"), "12:45-13:15 crosses lunch");
    assert.ok(checkSlot(ctx, C, +at("18:45"), 30).some((i) => i.code === "OUTSIDE_HOURS"), "18:45-19:15 runs past closing");
    assert.ok(checkSlot(ctx, C, +at("08:30"), 30).some((i) => i.code === "OUTSIDE_HOURS"));
    assert.equal(checkSlot(ctx, C, +at("18:30"), 30).length, 0, "18:30-19:00 fits");
  });

  test("blocked time off removes slots", async () => {
    await q(`INSERT INTO time_off (barber_id, start_at, end_at, kind, reason) VALUES ($1, $2, $3, 'BLOCK', 'Dentist')`, [C, at("14:00"), at("15:00")]);
    const slots = listSlots(await loadDay(dateISO, { barberIds: [C], serviceId: SVC }), 30, [C]).map((s) => s.time);
    assert.ok(!slots.includes("14:00") && !slots.includes("14:30") && !slots.includes("13:45"));
    assert.ok(slots.includes("15:00"));
    await q(`DELETE FROM time_off WHERE barber_id = $1`, [C]);
  });

  test("barbers cannot act on another barber's appointments; reschedule obeys the same rules", async () => {
    const userB = (await q1(`INSERT INTO users (email, name, password_hash, role, barber_id) VALUES ('zztest-b@example.com','B','x','BARBER',$1) RETURNING id`, [B]))!.id;
    const barberB: Actor = { kind: "user", id: userB, name: "B", role: "BARBER", barberId: B };
    const p = await online(A, "18:00");
    await assert.rejects(transition(p.id, "approve", barberB), (e: any) => e.code === "FORBIDDEN");
    await assert.rejects(reschedule(p.id, { barberId: B }, barberB), (e: any) => e.code === "FORBIDDEN");
    // Admin reassigns A's 17:30 to B, who is free then
    await reschedule(p.id, { barberId: B }, admin);
    assert.equal((await q1(`SELECT barber_id FROM appointments WHERE id = $1`, [p.id]))!.barber_id, B);
    // Moving onto an occupied time is refused
    await assert.rejects(reschedule(p.id, { start: at("17:00") }, admin), (e: any) => e.code === "UNAVAILABLE");
  });

  test("customers cannot book in the past or inside minimum notice", async () => {
    const past = DateTime.now().setZone(zone).minus({ days: 1 }).toISODate()!;
    await assert.rejects(online(A, "11:00", past), (e: any) => e.issues.some((i: any) => i.code === "TOO_SOON"));
  });
});
