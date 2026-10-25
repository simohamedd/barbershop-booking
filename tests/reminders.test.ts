/*
 * Reminder sweep tests against a real Postgres database (DATABASE_URL). Creates its own records
 * (prefixed "ZZREM") and removes them afterwards.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { claimDueReminders } from "../lib/reminders";
import { pool, q, q1 } from "../lib/db";

let barber = "", service = "", customer = "", savedHours = 24;
const H = 3_600_000;

async function appt(hoursFromNow: number, status: "CONFIRMED" | "PENDING" | "CANCELLED", label: string) {
  const start = new Date(Date.now() + hoursFromNow * H);
  const end = new Date(+start + 30 * 60_000);
  const row = await q1<{ id: string }>(
    `INSERT INTO appointments (reference, customer_id, barber_id, service_id, customer_name, start_at, end_at, block_end_at,
       status, price_pence, duration_min, service_name, manage_token_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,1000,30,'ZZREM Cut','x') RETURNING id`,
    [`BK-ZR${Math.random().toString(36).slice(2, 6).toUpperCase()}`, customer, barber, service, `ZZREM ${label}`, start, end, status],
  );
  return row!.id;
}

async function cleanup() {
  await q(`DELETE FROM appointments WHERE customer_name LIKE 'ZZREM%'`);
  await q(`DELETE FROM customers WHERE name LIKE 'ZZREM%'`);
  await q(`DELETE FROM barbers WHERE name LIKE 'ZZREM%'`);
  await q(`DELETE FROM services WHERE name LIKE 'ZZREM%'`);
}

before(async () => {
  await cleanup();
  savedHours = (await q1<{ h: number }>(`SELECT reminder_hours_before h FROM shop_settings WHERE id = 1`))!.h;
  await q(`UPDATE shop_settings SET reminder_hours_before = 24 WHERE id = 1`);
  barber = (await q1(`INSERT INTO barbers (name, slug) VALUES ('ZZREM Barber', 'zzrem-barber') RETURNING id`))!.id;
  service = (await q1(`INSERT INTO services (name, price_pence, duration_min) VALUES ('ZZREM Cut', 1000, 30) RETURNING id`))!.id;
  customer = (await q1(`INSERT INTO customers (name, phone) VALUES ('ZZREM Customer', '+447700999111') RETURNING id`))!.id;
});

after(async () => {
  await q(`UPDATE shop_settings SET reminder_hours_before = $1 WHERE id = 1`, [savedHours]);
  await cleanup();
  await pool().end();
});

test("confirmed appointments inside the window get exactly one reminder", async () => {
  const due = await appt(20, "CONFIRMED", "due");
  const first = await claimDueReminders();
  assert.ok(first.includes(due), "reminded on first run");
  const second = await claimDueReminders();
  assert.ok(!second.includes(due), "not reminded twice");
  assert.ok((await q1(`SELECT reminder_sent_at FROM appointments WHERE id = $1`, [due]))!.reminder_sent_at);
});

test("too early, too late, pending and cancelled appointments are skipped", async () => {
  const later = await appt(30, "CONFIRMED", "later");      // outside 24h window
  const imminent = await appt(0.2, "CONFIRMED", "imminent"); // starts in 12 minutes: too late to help
  const past = await appt(-2, "CONFIRMED", "past");
  const pending = await appt(10, "PENDING", "pending");
  const cancelled = await appt(10, "CANCELLED", "cancelled");
  const claimed = await claimDueReminders();
  for (const [id, why] of [[later, "later"], [imminent, "imminent"], [past, "past"], [pending, "pending"], [cancelled, "cancelled"]]) {
    assert.ok(!claimed.includes(id), `${why} should not be reminded`);
  }
});

test("overlapping sweeps never double-send", async () => {
  const id = await appt(12, "CONFIRMED", "race");
  const runs = await Promise.all(Array.from({ length: 8 }, () => claimDueReminders()));
  assert.equal(runs.flat().filter((x) => x === id).length, 1);
});

test("setting the window to 0 turns reminders off", async () => {
  await q(`UPDATE shop_settings SET reminder_hours_before = 0 WHERE id = 1`);
  const id = await appt(5, "CONFIRMED", "off");
  assert.ok(!(await claimDueReminders()).includes(id));
  await q(`UPDATE shop_settings SET reminder_hours_before = 24 WHERE id = 1`);
});
