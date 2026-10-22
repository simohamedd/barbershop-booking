"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, passwordProblem, requireAdmin } from "@/lib/auth";
import { pgCode, q, q1, tx } from "@/lib/db";

type R = { ok?: string; error?: string } | null;
const refresh = () => { revalidatePath("/", "layout"); };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "barber";
}

const PHOTO_MAX = 350_000; // ~350 KB data URL after client-side resizing
function cleanPhoto(v: string) {
  if (!v) return "";
  if (v.startsWith("data:image/") && v.length <= PHOTO_MAX) return v;
  if (/^https:\/\/[^\s"'<>]+$/.test(v) && v.length < 1000) return v;
  throw new Error("Photo must be an uploaded image under 350 KB or an https:// link.");
}

/* --------------------------------- barbers --------------------------------- */

const BarberForm = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  title: z.string().trim().max(60),
  specialties: z.string().trim().max(200),
  bio: z.string().trim().max(800),
  phone: z.string().trim().max(30),
  sort_order: z.coerce.number().int().min(0).max(999),
});

export async function saveBarber(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const id = str(fd, "id");
  const p = BarberForm.safeParse(Object.fromEntries(["name", "title", "specialties", "bio", "phone", "sort_order"].map((k) => [k, str(fd, k) || (k === "sort_order" ? "0" : "")])));
  if (!p.success) return { error: p.error.issues[0].message };
  let photo: string;
  try { photo = cleanPhoto(str(fd, "photo")); } catch (e: any) { return { error: e.message }; }
  const d = p.data;
  if (id) {
    await q(`UPDATE barbers SET name=$2, title=$3, specialties=$4, bio=$5, phone=$6, sort_order=$7, photo=$8, updated_at=now() WHERE id=$1`,
      [id, d.name, d.title, d.specialties, d.bio, d.phone, d.sort_order, photo]);
    await q(`UPDATE users SET name = $2 WHERE barber_id = $1`, [id, d.name]);
    refresh();
    return { ok: "Profile saved." };
  }
  let slug = slugify(d.name);
  if (await q1(`SELECT 1 FROM barbers WHERE slug = $1`, [slug])) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const row = await tx(async (c) => {
    const r = await q1<{ id: string }>(`INSERT INTO barbers (name, slug, title, specialties, bio, phone, sort_order, photo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.name, slug, d.title, d.specialties, d.bio, d.phone, d.sort_order, photo], c);
    // Start with the shop's opening hours and all active services; the admin can adjust.
    await q(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) SELECT $1, weekday, start_time, end_time FROM working_hours WHERE barber_id IS NULL`, [r!.id], c);
    await q(`INSERT INTO barber_services (barber_id, service_id) SELECT $1, id FROM services WHERE active AND deleted_at IS NULL`, [r!.id], c);
    return r!;
  });
  refresh();
  redirect(`/admin/barbers/${row.id}?created=1`);
}

export async function setBarberServices(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const id = str(fd, "id");
  const ids = fd.getAll("service").map(String);
  await tx(async (c) => {
    await q(`DELETE FROM barber_services WHERE barber_id = $1`, [id], c);
    if (ids.length) await q(`INSERT INTO barber_services (barber_id, service_id) SELECT $1, unnest($2::uuid[])`, [id, ids], c);
  });
  refresh();
  return { ok: `${ids.length} service${ids.length === 1 ? "" : "s"} assigned.` };
}

export async function setBarberFlags(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const id = str(fd, "id");
  const active = fd.get("active") === "on";
  await q(`UPDATE barbers SET active = $2, can_edit_schedule = $3, updated_at = now() WHERE id = $1`, [id, active, fd.get("can_edit_schedule") === "on"]);
  refresh();
  return { ok: active ? "Saved. This barber can take bookings." : "Saved. This barber is hidden from the website and can't be booked. Existing appointments stay as they are." };
}

export async function removeBarber(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const id = str(fd, "id");
  const upcoming = await q1<{ n: number }>(`SELECT count(*)::int n FROM appointments WHERE barber_id = $1 AND status IN ('PENDING','CONFIRMED') AND start_at > now()`, [id]);
  if (upcoming!.n > 0) return { error: `This barber still has ${upcoming!.n} upcoming appointment${upcoming!.n === 1 ? "" : "s"}. Reassign or cancel them first.` };
  await tx(async (c) => {
    await q(`UPDATE barbers SET deleted_at = now(), active = false WHERE id = $1`, [id], c);
    await q(`UPDATE users SET active = false WHERE barber_id = $1`, [id], c);
    await q(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE barber_id = $1)`, [id], c);
  });
  refresh();
  redirect("/admin/barbers?removed=1");
}

/* ---------------------------------- logins ---------------------------------- */

export async function createLogin(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const barberId = str(fd, "barber_id") || null;
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = String(fd.get("password") ?? "");
  const role = fd.get("role") === "ADMIN" ? "ADMIN" : "BARBER";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const prob = passwordProblem(password);
  if (prob) return { error: prob };
  try {
    await q(`INSERT INTO users (email, name, password_hash, role, barber_id) VALUES ($1, $2, $3, $4, $5)`,
      [email, name || email, await hashPassword(password), role, barberId]);
  } catch (e) {
    if (pgCode(e) === "23505") return { error: "That email (or barber) already has a login." };
    throw e;
  }
  refresh();
  return { ok: `Login created for ${email}. Share the password with them privately.` };
}

export async function resetPassword(_: R, fd: FormData): Promise<R> {
  const me = await requireAdmin();
  const userId = str(fd, "user_id");
  const password = String(fd.get("password") ?? "");
  const prob = passwordProblem(password);
  if (prob) return { error: prob };
  await q(`UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1`, [userId, await hashPassword(password)]);
  if (userId !== me.id) await q(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  return { ok: "Password updated. They'll need to sign in again." };
}

export async function updateLogin(_: R, fd: FormData): Promise<R> {
  const me = await requireAdmin();
  const userId = str(fd, "user_id");
  const active = fd.get("active") === "on";
  const admin = fd.get("admin") === "on";
  if (userId === me.id && (!active || !admin)) return { error: "You can't remove your own admin access or deactivate yourself." };
  const u = await q1<{ barber_id: string | null }>(`SELECT barber_id FROM users WHERE id = $1`, [userId]);
  if (!u) return { error: "Login not found." };
  if (!admin && !u.barber_id) return { error: "An admin without a barber profile must stay an admin. Deactivate the login instead." };
  await q(`UPDATE users SET active = $2, role = $3 WHERE id = $1`, [userId, active, admin ? "ADMIN" : "BARBER"]);
  if (!active) await q(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  const admins = await q1<{ n: number }>(`SELECT count(*)::int n FROM users WHERE role = 'ADMIN' AND active`);
  if (admins!.n === 0) {
    await q(`UPDATE users SET active = true, role = 'ADMIN' WHERE id = $1`, [me.id]);
    return { error: "At least one active admin is required." };
  }
  refresh();
  return { ok: "Login updated." };
}

/* --------------------------------- services --------------------------------- */

const ServiceForm = z.object({
  name: z.string().trim().min(2, "Enter a service name").max(80),
  description: z.string().trim().max(300),
  price: z.coerce.number().min(0, "Price can't be negative").max(10000),
  duration_min: z.coerce.number().int().min(5, "Duration must be at least 5 minutes").max(480),
  sort_order: z.coerce.number().int().min(0).max(999),
});

export async function saveService(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const id = str(fd, "id");
  const p = ServiceForm.safeParse({ name: str(fd, "name"), description: str(fd, "description"), price: str(fd, "price"), duration_min: str(fd, "duration_min"), sort_order: str(fd, "sort_order") || "0" });
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const pence = Math.round(d.price * 100);
  const active = fd.get("active") === "on";
  const barberIds = fd.getAll("barber").map(String);
  await tx(async (c) => {
    let sid = id;
    if (id) {
      await q(`UPDATE services SET name=$2, description=$3, price_pence=$4, duration_min=$5, sort_order=$6, active=$7, updated_at=now() WHERE id=$1`, [id, d.name, d.description, pence, d.duration_min, d.sort_order, active], c);
    } else {
      sid = (await q1<{ id: string }>(`INSERT INTO services (name, description, price_pence, duration_min, sort_order, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [d.name, d.description, pence, d.duration_min, d.sort_order, active], c))!.id;
    }
    await q(`DELETE FROM barber_services WHERE service_id = $1`, [sid], c);
    if (barberIds.length) await q(`INSERT INTO barber_services (barber_id, service_id) SELECT unnest($2::uuid[]), $1`, [sid, barberIds], c);
  });
  refresh();
  return { ok: id ? "Service saved. Existing bookings keep their original price and duration." : "Service added." };
}

export async function removeService(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  await q(`UPDATE services SET deleted_at = now(), active = false WHERE id = $1`, [str(fd, "id")]);
  refresh();
  return { ok: "Service removed. Past and upcoming bookings for it are unchanged." };
}

/* --------------------------------- customers -------------------------------- */

export async function saveCustomer(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const name = str(fd, "name");
  const email = str(fd, "email");
  if (name.length < 2) return { error: "Enter a name." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Check the email address." };
  await q(`UPDATE customers SET name = $2, email = NULLIF($3, ''), notes = $4, updated_at = now() WHERE id = $1`, [str(fd, "id"), name, email, str(fd, "notes").slice(0, 2000)]);
  refresh();
  return { ok: "Customer saved." };
}

/* --------------------------------- settings --------------------------------- */

const SettingsForm = z.object({
  shop_name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  about: z.string().trim().max(600),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(120),
  whatsapp_number: z.string().trim().max(40),
  maps_url: z.string().trim().max(500).refine((v) => !v || /^https:\/\//.test(v), "Maps link must start with https://"),
  hero_image_url: z.string().trim().max(1000).refine((v) => !v || /^https:\/\//.test(v), "Photo link must start with https://"),
  logo_url: z.string().trim().max(1000).refine((v) => !v || /^https:\/\//.test(v), "Logo link must start with https://"),
  timezone: z.string().trim().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code like GBP"),
  gallery_urls: z.string().max(5000).refine((v) => v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).every((x) => /^https:\/\/\S+$/.test(x)), "Each gallery photo must be an https:// link on its own line"),
  established_year: z.string().trim().refine((v) => !v || (/^\d{4}$/.test(v) && +v >= 1800 && +v <= new Date().getFullYear()), "Enter the year the shop opened, e.g. 2014"),
});

export async function saveShopSettings(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const p = SettingsForm.safeParse(Object.fromEntries(Object.keys(SettingsForm.shape).map((k) => [k, k === "gallery_urls" ? String(fd.get(k) ?? "") : str(fd, k)])));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const gallery = d.gallery_urls.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 9).join("\n");
  await q(`UPDATE shop_settings SET shop_name=$1, tagline=$2, about=$3, address=$4, phone=$5, email=$6, whatsapp_number=$7, maps_url=$8, hero_image_url=$9, logo_url=$10, timezone=$11, currency=$12, gallery_urls=$13, established_year=$14, updated_at=now() WHERE id=1`,
    [d.shop_name, d.tagline, d.about, d.address, d.phone, d.email, d.whatsapp_number, d.maps_url, d.hero_image_url, d.logo_url, d.timezone, d.currency, gallery, d.established_year ? Number(d.established_year) : null]);
  refresh();
  return { ok: "Shop details saved." };
}

const RulesForm = z.object({
  buffer_minutes: z.coerce.number().int().min(0).max(120),
  slot_interval_minutes: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "Choose a slot interval from the list"),
  pending_expiry_minutes: z.coerce.number().int().min(5, "Approval window must be at least 5 minutes").max(10080),
  min_notice_minutes: z.coerce.number().int().min(0).max(10080),
  max_advance_days: z.coerce.number().int().min(1).max(365),
  cancellation_cutoff_hours: z.coerce.number().int().min(0).max(168),
  cancellation_policy: z.string().trim().max(800),
});

export async function saveBookingRules(_: R, fd: FormData): Promise<R> {
  await requireAdmin();
  const p = RulesForm.safeParse(Object.fromEntries(Object.keys(RulesForm.shape).map((k) => [k, str(fd, k)])));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  await q(`UPDATE shop_settings SET buffer_minutes=$1, slot_interval_minutes=$2, pending_expiry_minutes=$3, min_notice_minutes=$4, max_advance_days=$5,
           cancellation_cutoff_hours=$6, cancellation_policy=$7, allow_online_booking=$8, updated_at=now() WHERE id=1`,
    [d.buffer_minutes, d.slot_interval_minutes, d.pending_expiry_minutes, d.min_notice_minutes, d.max_advance_days, d.cancellation_cutoff_hours, d.cancellation_policy, fd.get("allow_online_booking") === "on"]);
  refresh();
  return { ok: "Booking rules saved. They apply to new bookings; existing ones keep their times." };
}
