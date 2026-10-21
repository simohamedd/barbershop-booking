/** Sample shop: settings, opening hours, services and barbers (no bookings, no logins). Used by the seed script and /setup. */
import type { PoolClient } from "pg";

export const SERVICES = [
  { name: "Haircut", description: "Scissor or clipper cut, washed and styled.", price: 2500, dur: 30 },
  { name: "Skin fade", description: "Fade down to the skin, sharp line-up and finish.", price: 2800, dur: 45 },
  { name: "Beard trim", description: "Shape, line and condition. Hot towel finish.", price: 1500, dur: 20 },
  { name: "Haircut & beard", description: "Full haircut with a beard shape and line-up.", price: 3800, dur: 60 },
  { name: "Hot towel shave", description: "Traditional straight-razor shave with hot towels.", price: 2500, dur: 30 },
  { name: "Kids cut (under 12)", description: "Patient, quick cut for young ones.", price: 1600, dur: 30 },
  { name: "Line-up", description: "Edges and hairline tidy between cuts.", price: 1000, dur: 15 },
];

export const BARBERS = [
  { name: "Marcus Reid", title: "Senior barber", specialties: "Skin fades, tapers, textured crops", bio: "Twelve years behind the chair. Known for clean, blended fades that grow out well.",
    services: ["Haircut", "Skin fade", "Haircut & beard", "Line-up", "Beard trim"],
    hours: { 1: ["09:00", "18:00"], 2: ["09:00", "18:00"], 3: ["09:00", "18:00"], 4: ["11:00", "19:00"], 5: ["09:00", "19:00"], 6: ["09:00", "17:00"] }, brk: ["13:00", "13:30"] },
  { name: "Idris Haddad", title: "Beard specialist", specialties: "Beard sculpting, hot towel shaves, classic cuts", bio: "Trained in Casablanca and London. Straight-razor work is his favourite part of the job.",
    services: ["Haircut", "Beard trim", "Haircut & beard", "Hot towel shave", "Line-up"],
    hours: { 2: ["10:00", "19:00"], 3: ["10:00", "19:00"], 4: ["10:00", "19:00"], 5: ["10:00", "19:00"], 6: ["09:00", "18:00"], 7: ["10:00", "16:00"] }, brk: ["14:00", "14:30"] },
  { name: "Tomasz Nowak", title: "Barber", specialties: "Scissor cuts, longer styles, classic side parts", bio: "Patient with longer hair and grown-out styles. Ask him about low-maintenance cuts.",
    services: ["Haircut", "Skin fade", "Haircut & beard", "Kids cut (under 12)", "Line-up"],
    hours: { 1: ["09:00", "17:00"], 2: ["09:00", "17:00"], 4: ["09:00", "17:00"], 5: ["09:00", "17:00"], 6: ["09:00", "18:00"] }, brk: ["12:30", "13:00"] },
  { name: "Leon Okafor", title: "Barber", specialties: "Kids cuts, hair designs, afro and curly hair", bio: "Freehand designs and curly hair are his thing. Great with nervous first-timers.",
    services: ["Haircut", "Skin fade", "Kids cut (under 12)", "Line-up", "Beard trim"],
    hours: { 1: ["10:00", "19:00"], 3: ["10:00", "19:00"], 5: ["10:00", "19:00"], 6: ["09:00", "18:00"], 7: ["10:00", "16:00"] }, brk: ["15:00", "15:30"] },
];

export const SHOP_HOURS: Record<number, [string, string]> = { 1: ["09:00", "19:00"], 2: ["09:00", "19:00"], 3: ["09:00", "19:00"], 4: ["09:00", "19:00"], 5: ["09:00", "19:00"], 6: ["09:00", "18:00"], 7: ["10:00", "16:00"] };

export async function loadSampleShop(c: PoolClient): Promise<string[]> {
  await c.query(
    `UPDATE shop_settings SET shop_name=$1, tagline=$2, about=$3, address=$4, phone=$5, email=$6, whatsapp_number=$7, maps_url=$8,
       hero_image_url=$9, timezone='Europe/London', buffer_minutes=5, slot_interval_minutes=15, pending_expiry_minutes=120,
       min_notice_minutes=60, max_advance_days=60, cancellation_cutoff_hours=2, cancellation_policy=$10 WHERE id=1`,
    [
      "Brass & Blade",
      "Cuts, fades and hot towel shaves.",
      "A four-chair neighbourhood barbershop. Walk-ins welcome when a chair is free, but booking guarantees your time.",
      "12 Example Street, Manchester M1 1AA",
      "+44 161 000 0000",
      "hello@example.com",
      "+44 7700 900000",
      "https://maps.google.com/?q=Manchester",
      "https://images.unsplash.com/photo-1621645582931-d1d3e6564943?auto=format&fit=crop&w=1800&q=70", // Unsplash, Joshua Lawrence
      "Free cancellation up to 2 hours before your appointment. Please let us know if you're running late — after 10 minutes we may need to shorten or rebook your service.",
    ],
  );
  for (const [d, [s, e]] of Object.entries(SHOP_HOURS)) {
    await c.query(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES (NULL, $1, $2, $3)`, [d, s, e]);
  }
  const svcId: Record<string, string> = {};
  for (const [i, s] of SERVICES.entries()) {
    const r = await c.query(`INSERT INTO services (name, description, price_pence, duration_min, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [s.name, s.description, s.price, s.dur, i]);
    svcId[s.name] = r.rows[0].id;
  }
  const barberIds: string[] = [];
  for (const [i, b] of BARBERS.entries()) {
    const slug = b.name.toLowerCase().replace(/[^a-z]+/g, "-");
    const r = await c.query(
      `INSERT INTO barbers (name, slug, title, bio, specialties, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.name, slug, b.title, b.bio, b.specialties, i],
    );
    const id = r.rows[0].id;
    barberIds.push(id);
    for (const s of b.services) await c.query(`INSERT INTO barber_services VALUES ($1, $2)`, [id, svcId[s]]);
    for (const [d, [s, e]] of Object.entries(b.hours)) {
      await c.query(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)`, [id, d, s, e]);
      await c.query(`INSERT INTO breaks (barber_id, weekday, start_time, end_time, label) VALUES ($1,$2,$3,$4,'Lunch')`, [id, d, b.brk[0], b.brk[1]]);
    }
  }

  return barberIds;
}
