/** Shared slot views for the booking UIs (public and admin). */
import { DateTime } from "luxon";
import { barbersForService, listSlots, loadDay } from "./availability";
import { q1 } from "./db";
import { getSettings } from "./settings";

export type SlotView = { start: string; time: string; available: boolean; freeBarberIds: string[] };

export async function slotsForDay(serviceId: string, barberId: string | "any", dateISO: string, opts: { staff?: boolean } = {}) {
  const settings = await getSettings();
  const service = await q1<{ duration_min: number }>(`SELECT duration_min FROM services WHERE id = $1 AND deleted_at IS NULL AND (active OR $2)`, [serviceId, !!opts.staff]);
  if (!service) return null;
  const qualified = await barbersForService(serviceId);
  const ids = qualified.map((b) => b.id);
  const ctx = await loadDay(dateISO, { barberIds: ids, serviceId, settings });
  const all = listSlots(ctx, service.duration_min, ids, { ignoreNotice: opts.staff });
  const slots: SlotView[] = all.map((s) => ({
    start: s.start,
    time: s.time,
    available: barberId === "any" ? true : s.barberIds.includes(barberId),
    freeBarberIds: s.barberIds,
  }));
  return { date: dateISO, durationMin: service.duration_min, barbers: qualified, slots, timezone: settings.timezone };
}

export async function dayCounts(serviceId: string, barberId: string | "any", fromISO: string, days: number) {
  const settings = await getSettings();
  const service = await q1<{ duration_min: number }>(`SELECT duration_min FROM services WHERE id = $1 AND deleted_at IS NULL`, [serviceId]);
  if (!service) return null;
  const qualified = await barbersForService(serviceId);
  const ids = barberId === "any" ? qualified.map((b) => b.id) : qualified.some((b) => b.id === barberId) ? [barberId] : [];
  const today = DateTime.now().setZone(settings.timezone).startOf("day");
  const lastDay = today.plus({ days: settings.max_advance_days });
  let d = DateTime.fromISO(fromISO, { zone: settings.timezone });
  if (d < today) d = today;
  const dates: string[] = [];
  for (let i = 0; i < days && d <= lastDay; i++, d = d.plus({ days: 1 })) dates.push(d.toISODate()!);
  const out = await Promise.all(dates.map(async (date) => {
    if (!ids.length) return { date, count: 0 };
    const ctx = await loadDay(date, { barberIds: ids, serviceId, settings });
    return { date, count: listSlots(ctx, service.duration_min, ids).length };
  }));
  return { days: out, maxDate: lastDay.toISODate()!, today: today.toISODate()! };
}
