/*
 * Sample data so the app can be tried immediately.
 *   npm run db:seed              -> shop settings, services, barbers, hours, a few bookings
 *   npm run db:seed -- --demo    -> also creates demo logins (NOT for production)
 * Safe to run on an empty database only; refuses if barbers already exist (use --force to wipe sample tables).
 */
import { DateTime } from "luxon";
import { hashPassword } from "../lib/auth-core";
import { bookingReference, randomToken, sha256 } from "../lib/crypto";
import { pool } from "../lib/db";
import { BARBERS, loadSampleShop } from "../lib/sample-data";

const args = new Set(process.argv.slice(2));

async function main() {
  const db = pool();
  const existing = (await db.query(`SELECT count(*)::int n FROM barbers`)).rows[0].n;
  if (existing > 0 && !args.has("--force")) {
    console.log("Barbers already exist — skipping seed. Use --force to wipe sample tables and reseed.");
    await db.end();
    return;
  }
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    if (args.has("--force")) {
      await c.query(`TRUNCATE notifications, appointment_history, appointments, customers, time_off, breaks, working_hours, barber_services, services, sessions RESTART IDENTITY CASCADE`);
      await c.query(`DELETE FROM users WHERE barber_id IS NOT NULL OR email LIKE '%@example.com'`);
      await c.query(`DELETE FROM barbers`);
    }
    const barberIds = await loadSampleShop(c);

    // A handful of bookings around today so the dashboards have something in them.
    const zone = "Europe/London";
    const today = DateTime.now().setZone(zone).startOf("day");
    const customers = [
      ["Daniel Ashworth", "+447700900101", "daniel@example.com"],
      ["Yusuf Rahman", "+447700900102", null],
      ["Chris Bell", "+447700900103", "chris@example.com"],
      ["Sam Whitfield", "+447700900104", null],
      ["Omar Benali", "+447700900105", null],
    ];
    const custIds: string[] = [];
    for (const [n, p, e] of customers) custIds.push((await c.query(`INSERT INTO customers (name, phone, email) VALUES ($1,$2,$3) RETURNING id`, [n, p, e])).rows[0].id);

    const svc = (await c.query(`SELECT id, name, price_pence, duration_min FROM services`)).rows;
    const plan: [number, string, number, number, string, string, "PENDING" | "CONFIRMED" | "COMPLETED"][] = [
      // dayOffset, time, barberIdx, custIdx, service, source, status
      [1, "10:00", 0, 0, "Skin fade", "ONLINE", "CONFIRMED"],
      [1, "11:00", 0, 1, "Haircut & beard", "WHATSAPP", "CONFIRMED"],
      [1, "11:00", 1, 2, "Hot towel shave", "ONLINE", "PENDING"],
      [2, "15:00", 2, 3, "Haircut", "PHONE", "CONFIRMED"],
      [2, "16:00", 3, 4, "Line-up", "ONLINE", "PENDING"],
      [-1, "10:00", 0, 2, "Haircut", "ONLINE", "COMPLETED"],
      [-2, "12:00", 1, 0, "Beard trim", "WALK_IN", "COMPLETED"],
    ];
    for (const [off, time, bi, ci, sname, source, status] of plan) {
      const s = svc.find((x) => x.name === sname)!;
      const [h, m] = time.split(":").map(Number);
      let start = today.plus({ days: off }).set({ hour: h, minute: m });
      const bh = BARBERS[bi].hours as unknown as Record<number, string[] | undefined>;
      for (let k = 0; k < 7 && !bh[start.weekday]; k++) start = start.plus({ days: off >= 0 ? 1 : -1 }); // land on a working day
      const end = start.plus({ minutes: s.duration_min });
      const r = await c.query(
        `INSERT INTO appointments (reference, customer_id, barber_id, service_id, customer_name, start_at, end_at, block_end_at, status, source,
           price_pence, duration_min, service_name, expires_at, manage_token_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [bookingReference(), custIds[ci], barberIds[bi], s.id, customers[ci][0], start.toJSDate(), end.toJSDate(), end.plus({ minutes: 5 }).toJSDate(),
         status, source, s.price_pence, s.duration_min, s.name, status === "PENDING" ? DateTime.now().plus({ hours: 24 }).toJSDate() : null, sha256(randomToken())],
      );
      await c.query(`INSERT INTO appointment_history (appointment_id, to_status, action, details, actor_label) VALUES ($1,$2,'created','Sample data','System')`, [r.rows[0].id, status]);
    }

    if (args.has("--demo")) {
      const pw = await hashPassword("demo-pass-2026");
      await c.query(`INSERT INTO users (email, name, password_hash, role) VALUES ('admin@example.com', 'Shop Owner', $1, 'ADMIN') ON CONFLICT (email) DO NOTHING`, [pw]);
      for (const [i, b] of BARBERS.entries()) {
        const email = `${b.name.split(" ")[0].toLowerCase()}@example.com`;
        await c.query(`INSERT INTO users (email, name, password_hash, role, barber_id) VALUES ($1,$2,$3,'BARBER',$4) ON CONFLICT (email) DO NOTHING`, [email, b.name, pw, barberIds[i]]);
      }
      console.log("Demo logins (password demo-pass-2026): admin@example.com, marcus@example.com, idris@example.com, tomasz@example.com, leon@example.com");
    }
    await c.query("COMMIT");
    console.log("Seed complete.");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
