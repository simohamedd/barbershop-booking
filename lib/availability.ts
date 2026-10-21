/**
 * Availability engine. One set of rules, used by:
 *  - the public booking calendar (slot lists),
 *  - server-side validation of every booking / reschedule (online, WhatsApp, phone, walk-in),
 *  - the admin "check availability" warnings.
 *
 * The final word on overlaps is the database exclusion constraint (no_overlapping_appointments);
 * this module mirrors it so that users see accurate slots and clear reasons.
 */
import { DateTime } from "luxon";
import { q, type Queryable, pool } from "./db";
import { getSettings, type Settings } from "./settings";
import { atLocalMinutes, localDay, overlaps, toMinutes } from "./time";

export type IssueCode =
  | "OVERLAP"          // another pending/confirmed booking occupies the time (never overridable)
  | "OUTSIDE_HOURS"    // outside barber's working hours or shop opening hours
  | "BREAK"            // during a recurring break
  | "TIME_OFF"         // blocked period / holiday / day off / shop closure
  | "TOO_SOON"         // inside minimum notice, or in the past
  | "TOO_FAR"          // beyond the booking horizon
  | "NOT_OFFERED"      // barber does not perform this service
  | "BARBER_INACTIVE";

export type Issue = { code: IssueCode; message: string };

export const HARD_ISSUES: IssueCode[] = ["OVERLAP", "NOT_OFFERED", "BARBER_INACTIVE"];

type Win = { start: number; end: number };

export type BarberDay = {
  barberId: string;
  name: string;
  active: boolean;
  offersService: boolean;
  windows: Win[];          // working windows (barber ∩ shop), epoch ms
  breaks: (Win & { label: string })[];
  timeOff: (Win & { reason: string; kind: string })[];
  busy: (Win & { id: string; status: string })[]; // pending/confirmed occupied ranges (start .. block_end)
};

export type DayContext = {
  settings: Settings;
  dateISO: string;
  day: DateTime;
  barbers: Map<string, BarberDay>;
};

/** Mark pending bookings whose hold has lapsed as EXPIRED, releasing their slots. Returns expired ids. */
export async function expireStalePending(db: Queryable = pool()): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `WITH x AS (
       UPDATE appointments SET status = 'EXPIRED', updated_at = now()
       WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= now()
       RETURNING id
     )
     INSERT INTO appointment_history (appointment_id, from_status, to_status, action, details, actor_label)
     SELECT id, 'PENDING', 'EXPIRED', 'expired', 'Not approved before the approval deadline; slot released', 'System' FROM x
     RETURNING appointment_id AS id`,
    [],
    db,
  );
  return rows.map((r) => r.id);
}

/** Load everything needed to evaluate a local day for a set of barbers (or all active barbers). */
export async function loadDay(
  dateISO: string,
  opts: { barberIds?: string[]; serviceId?: string | null; settings?: Settings; excludeAppointmentId?: string } = {},
  db: Queryable = pool(),
): Promise<DayContext> {
  const settings = opts.settings ?? (await getSettings(db));
  const zone = settings.timezone;
  const day = localDay(dateISO, zone);
  const weekday = day.weekday; // 1..7
  // Look a little beyond the day so buffers/long services crossing midnight are respected.
  const rangeStart = day.minus({ hours: 12 }).toJSDate();
  const rangeEnd = day.plus({ days: 1, hours: 12 }).toJSDate();

  const barberRows = await q<{ id: string; name: string; active: boolean; offers: boolean }>(
    `SELECT b.id, b.name, b.active,
            CASE WHEN $2::uuid IS NULL THEN true
                 ELSE EXISTS (SELECT 1 FROM barber_services bs WHERE bs.barber_id = b.id AND bs.service_id = $2::uuid) END AS offers
     FROM barbers b
     WHERE b.deleted_at IS NULL AND ($1::uuid[] IS NULL OR b.id = ANY($1::uuid[]))
     ORDER BY b.sort_order, b.name`,
    [opts.barberIds ?? null, opts.serviceId ?? null],
    db,
  );
  const ids = barberRows.map((b) => b.id);

  // A transaction client can only run one query at a time, so these run in sequence.
  const hours = await q<{ barber_id: string; start_time: string; end_time: string }>(
      `SELECT barber_id, start_time::text, end_time::text FROM working_hours WHERE barber_id = ANY($1) AND weekday = $2`,
      [ids, weekday], db);
  const shopHours = await q<{ start_time: string; end_time: string }>(
      `SELECT start_time::text, end_time::text FROM working_hours WHERE barber_id IS NULL AND weekday = $1`, [weekday], db);
  const shopHasHours = await q<{ n: number }>(`SELECT count(*)::int AS n FROM working_hours WHERE barber_id IS NULL`, [], db);
  const brk = await q<{ barber_id: string; start_time: string; end_time: string; label: string }>(
      `SELECT barber_id, start_time::text, end_time::text, label FROM breaks WHERE barber_id = ANY($1) AND weekday = $2`,
      [ids, weekday], db);
  const off = await q<{ barber_id: string | null; start_at: Date; end_at: Date; reason: string; kind: string }>(
      `SELECT barber_id, start_at, end_at, reason, kind FROM time_off
       WHERE (barber_id IS NULL OR barber_id = ANY($1)) AND start_at < $3 AND end_at > $2`,
      [ids, rangeStart, rangeEnd], db);
  const appts = await q<{ id: string; barber_id: string; start_at: Date; block_end_at: Date; status: string }>(
      `SELECT id, barber_id, start_at, block_end_at, status FROM appointments
       WHERE barber_id = ANY($1) AND status IN ('PENDING','CONFIRMED')
         AND NOT (status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= now())
         AND start_at < $3 AND block_end_at > $2
         AND ($4::uuid IS NULL OR id <> $4::uuid)`,
      [ids, rangeStart, rangeEnd, opts.excludeAppointmentId ?? null], db);

  const toWin = (s: string, e: string): Win => ({
    start: atLocalMinutes(day, toMinutes(s)).toMillis(),
    end: atLocalMinutes(day, toMinutes(e)).toMillis(),
  });
  const shopWins = shopHours.map((h) => toWin(h.start_time, h.end_time));
  const enforceShop = shopHasHours[0]?.n > 0;

  const barbers = new Map<string, BarberDay>();
  for (const b of barberRows) {
    let windows = hours.filter((h) => h.barber_id === b.id).map((h) => toWin(h.start_time, h.end_time));
    if (enforceShop) windows = intersect(windows, shopWins);
    barbers.set(b.id, {
      barberId: b.id,
      name: b.name,
      active: b.active,
      offersService: b.offers,
      windows,
      breaks: brk.filter((x) => x.barber_id === b.id).map((x) => ({ ...toWin(x.start_time, x.end_time), label: x.label })),
      timeOff: off
        .filter((x) => x.barber_id === null || x.barber_id === b.id)
        .map((x) => ({ start: +x.start_at, end: +x.end_at, reason: x.reason, kind: x.barber_id === null ? "CLOSURE" : x.kind })),
      busy: appts.filter((a) => a.barber_id === b.id).map((a) => ({ start: +a.start_at, end: +a.block_end_at, id: a.id, status: a.status })),
    });
  }
  return { settings, dateISO, day, barbers };
}

function intersect(a: Win[], b: Win[]): Win[] {
  const out: Win[] = [];
  for (const x of a) for (const y of b) {
    const s = Math.max(x.start, y.start);
    const e = Math.min(x.end, y.end);
    if (e > s) out.push({ start: s, end: e });
  }
  return out.sort((p, r) => p.start - r.start);
}

/**
 * Check one proposed booking for one barber. Returns every reason it is not allowed (empty = OK).
 * The occupied range is [start, start + duration + buffer), matching how appointments store block_end_at.
 */
export function checkSlot(
  ctx: DayContext,
  barberId: string,
  start: number,
  durationMin: number,
  opts: { ignoreNotice?: boolean; now?: number } = {},
): Issue[] {
  const b = ctx.barbers.get(barberId);
  const issues: Issue[] = [];
  if (!b) return [{ code: "BARBER_INACTIVE", message: "This barber is not available." }];
  const s = ctx.settings;
  const end = start + durationMin * 60_000;
  const blockEnd = end + s.buffer_minutes * 60_000;
  const now = opts.now ?? Date.now();

  if (!b.active) issues.push({ code: "BARBER_INACTIVE", message: `${b.name} is not currently taking bookings.` });
  if (!b.offersService) issues.push({ code: "NOT_OFFERED", message: `${b.name} does not offer this service.` });

  const clash = b.busy.find((x) => overlaps(start, blockEnd, x.start, x.end));
  if (clash) {
    issues.push({
      code: "OVERLAP",
      message: `${b.name} already has a ${clash.status === "PENDING" ? "pending" : "confirmed"} booking at this time.`,
    });
  }

  const inside = b.windows.some((w) => start >= w.start && end <= w.end);
  if (!inside) issues.push({ code: "OUTSIDE_HOURS", message: `Outside ${b.name}'s working hours or shop opening hours.` });

  const br = b.breaks.find((x) => overlaps(start, end, x.start, x.end));
  if (br) issues.push({ code: "BREAK", message: `${b.name} is on a break (${br.label}).` });

  const off = b.timeOff.find((x) => overlaps(start, end, x.start, x.end));
  if (off) {
    issues.push({
      code: "TIME_OFF",
      message: off.kind === "CLOSURE" ? `The shop is closed${off.reason ? ` (${off.reason})` : ""}.` : `${b.name} is unavailable${off.reason ? ` (${off.reason})` : ""}.`,
    });
  }

  if (!opts.ignoreNotice) {
    if (start < now + s.min_notice_minutes * 60_000) {
      issues.push({ code: "TOO_SOON", message: start < now ? "This time has already passed." : `Bookings need at least ${s.min_notice_minutes} minutes' notice.` });
    }
    if (start > now + s.max_advance_days * 86_400_000) {
      issues.push({ code: "TOO_FAR", message: `Bookings can be made up to ${s.max_advance_days} days ahead.` });
    }
  } else if (start < now - 60 * 60_000 * 24 * 30) {
    issues.push({ code: "TOO_SOON", message: "This time is too far in the past." });
  }
  return issues;
}

export type Slot = { start: string; time: string; barberIds: string[] };

/** All bookable start times on a day for the given barbers. Each slot lists which barbers can take it. */
export function listSlots(ctx: DayContext, durationMin: number, barberIds: string[], opts: { now?: number; ignoreNotice?: boolean } = {}): Slot[] {
  const step = ctx.settings.slot_interval_minutes;
  const zone = ctx.settings.timezone;
  const byStart = new Map<number, string[]>();
  for (const id of barberIds) {
    const b = ctx.barbers.get(id);
    if (!b) continue;
    for (const w of b.windows) {
      const startLocal = DateTime.fromMillis(w.start, { zone });
      let m = startLocal.hour * 60 + startLocal.minute;
      m = Math.ceil(m / step) * step;
      for (;; m += step) {
        const t = atLocalMinutes(ctx.day, m).toMillis();
        if (t + durationMin * 60_000 > w.end) break;
        if (checkSlot(ctx, id, t, durationMin, opts).length === 0) {
          const arr = byStart.get(t) ?? [];
          if (!arr.includes(id)) arr.push(id);
          byStart.set(t, arr);
        }
      }
    }
  }
  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ids]) => ({ start: new Date(t).toISOString(), time: DateTime.fromMillis(t, { zone }).toFormat("HH:mm"), barberIds: ids }));
}

/** Barbers (active, offering the service) for a service. */
export async function barbersForService(serviceId: string, db: Queryable = pool()) {
  return q<{ id: string; name: string }>(
    `SELECT b.id, b.name FROM barbers b JOIN barber_services bs ON bs.barber_id = b.id
     WHERE bs.service_id = $1 AND b.active AND b.deleted_at IS NULL ORDER BY b.sort_order, b.name`,
    [serviceId],
    db,
  );
}

export type Alternatives = {
  sameBarberTimes: { date: string; slots: Slot[] }[];
  otherBarbersAtTime: { id: string; name: string }[];
};

/** When a requested time is taken: other times for that barber (same day, else next days) and other barbers free at that time. */
export async function findAlternatives(params: {
  serviceId: string;
  durationMin: number;
  barberId: string | null;
  start: Date;
  ignoreNotice?: boolean;
  excludeAppointmentId?: string;
}, db: Queryable = pool()): Promise<Alternatives> {
  const settings = await getSettings(db);
  const zone = settings.timezone;
  const dateISO = DateTime.fromJSDate(params.start).setZone(zone).toISODate()!;
  const qualified = await barbersForService(params.serviceId, db);
  const ctx = await loadDay(dateISO, { barberIds: qualified.map((b) => b.id), serviceId: params.serviceId, settings, excludeAppointmentId: params.excludeAppointmentId }, db);
  const opts = { ignoreNotice: params.ignoreNotice };

  const otherBarbersAtTime = qualified
    .filter((b) => b.id !== params.barberId)
    .filter((b) => checkSlot(ctx, b.id, +params.start, params.durationMin, opts).length === 0);

  const sameBarberTimes: { date: string; slots: Slot[] }[] = [];
  if (params.barberId) {
    const today = listSlots(ctx, params.durationMin, [params.barberId], opts);
    if (today.length) sameBarberTimes.push({ date: dateISO, slots: nearest(today, +params.start, 8) });
    let d = DateTime.fromISO(dateISO, { zone });
    for (let i = 0; i < 14 && sameBarberTimes.length < 3; i++) {
      d = d.plus({ days: 1 });
      const c = await loadDay(d.toISODate()!, { barberIds: [params.barberId], serviceId: params.serviceId, settings, excludeAppointmentId: params.excludeAppointmentId }, db);
      const s = listSlots(c, params.durationMin, [params.barberId], opts);
      if (s.length) sameBarberTimes.push({ date: d.toISODate()!, slots: s.slice(0, 8) });
    }
  }
  return { sameBarberTimes, otherBarbersAtTime };
}

function nearest(slots: Slot[], t: number, n: number) {
  return [...slots].sort((a, b) => Math.abs(+new Date(a.start) - t) - Math.abs(+new Date(b.start) - t)).slice(0, n)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}
