import { DateTime } from "luxon";
import { listSlots, loadDay } from "./availability";
import { q } from "./db";
import { getSettings, type Settings } from "./settings";
import { minutesToHHMM, toMinutes } from "./time";

export type PublicService = { id: string; name: string; description: string; price_pence: number; duration_min: number };
export type PublicBarber = {
  id: string; name: string; slug: string; title: string; bio: string; specialties: string; photo: string;
  service_ids: string[];
  hours: { weekday: number; start: string; end: string }[];
};

export async function publicServices(): Promise<PublicService[]> {
  return q(`SELECT id, name, description, price_pence, duration_min FROM services WHERE active AND deleted_at IS NULL ORDER BY sort_order, name`);
}

export async function publicBarbers(): Promise<PublicBarber[]> {
  return q(
    `SELECT b.id, b.name, b.slug, b.title, b.bio, b.specialties, b.photo,
       COALESCE((SELECT array_agg(bs.service_id) FROM barber_services bs JOIN services s ON s.id = bs.service_id
                 WHERE bs.barber_id = b.id AND s.active AND s.deleted_at IS NULL), '{}') AS service_ids,
       COALESCE((SELECT json_agg(json_build_object('weekday', w.weekday, 'start', to_char(w.start_time,'HH24:MI'), 'end', to_char(w.end_time,'HH24:MI')) ORDER BY w.weekday, w.start_time)
                 FROM working_hours w WHERE w.barber_id = b.id), '[]') AS hours
     FROM barbers b WHERE b.active AND b.deleted_at IS NULL ORDER BY b.sort_order, b.name`,
  );
}

export async function shopHours(): Promise<{ weekday: number; start: string; end: string }[]> {
  return q(`SELECT weekday, to_char(start_time,'HH24:MI') AS start, to_char(end_time,'HH24:MI') AS "end"
            FROM working_hours WHERE barber_id IS NULL ORDER BY weekday, start_time`);
}

/** Group weekly hours into display rows like "Mon – Fri  09:00 – 19:00". */
export function hoursRows(hours: { weekday: number; start: string; end: string }[]) {
  if (!hours.length) return []; // nothing configured yet: callers show "coming soon" instead of "Closed" every day
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDay = Array.from({ length: 7 }, (_, i) =>
    hours.filter((h) => h.weekday === i + 1).map((h) => `${h.start}–${h.end}`).join(", ") || "Closed",
  );
  const rows: { days: string; hours: string }[] = [];
  let i = 0;
  while (i < 7) {
    let j = i;
    while (j + 1 < 7 && byDay[j + 1] === byDay[i]) j++;
    rows.push({ days: i === j ? days[i] : `${days[i]}–${days[j]}`, hours: byDay[i] });
    i = j + 1;
  }
  return rows;
}

/** For the home page "chair board": each barber's next free start time (for their shortest service). */
export async function nextFreeByBarber(settings?: Settings) {
  const s = settings ?? (await getSettings());
  const barbers = await q<{ id: string; name: string; min_dur: number | null }>(
    `SELECT b.id, b.name, (SELECT min(sv.duration_min) FROM barber_services bs JOIN services sv ON sv.id = bs.service_id
                           WHERE bs.barber_id = b.id AND sv.active AND sv.deleted_at IS NULL) AS min_dur
     FROM barbers b WHERE b.active AND b.deleted_at IS NULL ORDER BY b.sort_order, b.name`,
  );
  const result = new Map<string, { date: string; time: string; start: string } | null>();
  const pending = barbers.filter((b) => b.min_dur);
  let day = DateTime.now().setZone(s.timezone).startOf("day");
  for (let i = 0; i < 8 && pending.some((b) => !result.has(b.id)); i++) {
    const todo = pending.filter((b) => !result.has(b.id));
    const ctx = await loadDay(day.toISODate()!, { barberIds: todo.map((b) => b.id), settings: s });
    for (const b of todo) {
      const slot = listSlots(ctx, b.min_dur!, [b.id])[0];
      if (slot) result.set(b.id, { date: day.toISODate()!, time: slot.time, start: slot.start });
    }
    day = day.plus({ days: 1 });
  }
  return barbers.map((b) => ({ id: b.id, name: b.name, next: result.get(b.id) ?? null }));
}

export function openNow(hours: { weekday: number; start: string; end: string }[], zone: string) {
  const now = DateTime.now().setZone(zone);
  const m = now.hour * 60 + now.minute;
  const today = hours.filter((h) => h.weekday === now.weekday);
  const open = today.find((h) => m >= toMinutes(h.start) && m < toMinutes(h.end));
  if (open) return { open: true, label: `Open until ${open.end}` };
  const later = today.find((h) => toMinutes(h.start) > m);
  if (later) return { open: false, label: `Opens at ${later.start} today` };
  return { open: false, label: "Closed now" };
}

/** Today's hours as a short label, e.g. "09:00–19:00", or null when closed today. */
export function todaysHours(hours: { weekday: number; start: string; end: string }[], zone: string) {
  const wd = DateTime.now().setZone(zone).weekday;
  const today = hours.filter((h) => h.weekday === wd);
  if (!today.length) return null;
  return `${today[0].start}–${today[today.length - 1].end}`;
}

export { minutesToHHMM };
