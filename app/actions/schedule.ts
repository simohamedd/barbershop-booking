"use server";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { q, q1, tx } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime, localToDate, toMinutes } from "@/lib/time";

type R = { ok?: string; error?: string } | null;
const TIME = /^\d{2}:\d{2}$/;

/** target = barber uuid or "shop". Admins: anything. Barbers: their own, if allowed to edit their schedule. */
async function authorise(target: string) {
  const u = await getUser();
  if (!u) throw new Error("Not signed in");
  if (u.role === "ADMIN") return u;
  if (target !== "shop" && target === u.barber_id && u.can_edit_schedule) return u;
  throw new Error("You don't have permission to change this schedule.");
}

export async function saveWeek(_: R, fd: FormData): Promise<R> {
  const target = String(fd.get("target"));
  try { await authorise(target); } catch (e: any) { return { error: e.message }; }
  const barberId = target === "shop" ? null : target;
  const hours: [number, string, string][] = [];
  const breaks: [number, string, string][] = [];
  for (let d = 1; d <= 7; d++) {
    if (fd.get(`d${d}_on`) !== "on") continue;
    const s = String(fd.get(`d${d}_start`)), e = String(fd.get(`d${d}_end`));
    if (!TIME.test(s) || !TIME.test(e) || toMinutes(e) <= toMinutes(s)) return { error: `Check the hours for day ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]}: the end must be after the start.` };
    hours.push([d, s, e]);
    const bs = String(fd.get(`d${d}_bstart`) ?? ""), be = String(fd.get(`d${d}_bend`) ?? "");
    if (barberId && bs && be) {
      if (!TIME.test(bs) || !TIME.test(be) || toMinutes(be) <= toMinutes(bs)) return { error: `Check the break on ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]}.` };
      breaks.push([d, bs, be]);
    }
  }
  await tx(async (c) => {
    await q(`DELETE FROM working_hours WHERE barber_id IS NOT DISTINCT FROM $1`, [barberId], c);
    for (const [d, s, e] of hours) await q(`INSERT INTO working_hours (barber_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)`, [barberId, d, s, e], c);
    if (barberId) {
      await q(`DELETE FROM breaks WHERE barber_id = $1`, [barberId], c);
      for (const [d, s, e] of breaks) await q(`INSERT INTO breaks (barber_id, weekday, start_time, end_time, label) VALUES ($1,$2,$3,$4,'Break')`, [barberId, d, s, e], c);
    }
  });
  revalidatePath("/", "layout");
  return { ok: "Weekly hours saved. Existing appointments are not moved; check the calendar for any now outside working hours." };
}

export async function addTimeOff(_: R, fd: FormData): Promise<R> {
  const target = String(fd.get("target"));
  let u;
  try { u = await authorise(target); } catch (e: any) { return { error: e.message }; }
  const s = await getSettings();
  const allDay = fd.get("all_day") === "on";
  const sd = String(fd.get("start_date")), ed = String(fd.get("end_date") || sd);
  const st = allDay ? "00:00" : String(fd.get("start_time")), et = allDay ? "00:00" : String(fd.get("end_time"));
  let start: Date, end: Date;
  try {
    start = localToDate(sd, st, s.timezone);
    end = allDay ? new Date(+localToDate(ed, "00:00", s.timezone) + 86_400_000) : localToDate(ed, et, s.timezone);
  } catch { return { error: "Choose valid dates and times." }; }
  if (+end <= +start) return { error: "The end must be after the start." };
  const kind = target === "shop" ? "CLOSURE" : (["BLOCK", "HOLIDAY", "DAY_OFF"].includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "BLOCK");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 120);
  await q(`INSERT INTO time_off (barber_id, start_at, end_at, kind, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [target === "shop" ? null : target, start, end, kind, reason, u.id]);
  const clash = await q1<{ n: number; first: Date }>(
    `SELECT count(*)::int n, min(start_at) first FROM appointments WHERE status IN ('PENDING','CONFIRMED') AND start_at < $2 AND end_at > $1 AND ($3::uuid IS NULL OR barber_id = $3::uuid)`,
    [start, end, target === "shop" ? null : target]);
  revalidatePath("/", "layout");
  if (clash && clash.n > 0) return { ok: `Blocked. Heads up: ${clash.n} existing appointment${clash.n === 1 ? "" : "s"} fall in this period (first at ${fmtDateTime(clash.first, s.timezone)}). They weren't cancelled; reschedule or cancel them from the calendar.` };
  return { ok: "Time blocked. No new bookings can be made in this period." };
}

export async function removeTimeOff(_: R, fd: FormData): Promise<R> {
  const id = String(fd.get("id"));
  const row = await q1<{ barber_id: string | null }>(`SELECT barber_id FROM time_off WHERE id = $1`, [id]);
  if (!row) return { error: "Already removed." };
  try { await authorise(row.barber_id ?? "shop"); } catch (e: any) { return { error: e.message }; }
  await q(`DELETE FROM time_off WHERE id = $1`, [id]);
  revalidatePath("/", "layout");
  return { ok: "Removed. Those times are bookable again." };
}
