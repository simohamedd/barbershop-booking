import { DateTime } from "luxon";

/** ISO weekday 1..7 */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Start of a local calendar day in the shop zone. dateISO = 'YYYY-MM-DD' */
export function localDay(dateISO: string, zone: string): DateTime {
  const d = DateTime.fromISO(dateISO, { zone });
  if (!d.isValid) throw new Error(`Invalid date ${dateISO}`);
  return d.startOf("day");
}

/** A wall-clock time (minutes after midnight) on a local day, as an absolute DateTime. */
export function atLocalMinutes(day: DateTime, minutes: number): DateTime {
  return day.set({ hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0, millisecond: 0 });
}

export function todayISO(zone: string): string {
  return DateTime.now().setZone(zone).toISODate()!;
}

export function fmtTime(d: Date | string, zone: string) {
  return DateTime.fromJSDate(new Date(d)).setZone(zone).toFormat("HH:mm");
}

export function fmtDate(d: Date | string, zone: string, fmt = "ccc d LLL yyyy") {
  return DateTime.fromJSDate(new Date(d)).setZone(zone).toFormat(fmt);
}

export function fmtDateTime(d: Date | string, zone: string) {
  return DateTime.fromJSDate(new Date(d)).setZone(zone).toFormat("ccc d LLL yyyy, HH:mm");
}

export function localDateISO(d: Date | string, zone: string) {
  return DateTime.fromJSDate(new Date(d)).setZone(zone).toISODate()!;
}

/** Parse 'YYYY-MM-DD' + 'HH:mm' in shop zone to a JS Date */
export function localToDate(dateISO: string, hhmm: string, zone: string): Date {
  const d = DateTime.fromISO(`${dateISO}T${hhmm}`, { zone });
  if (!d.isValid) throw new Error("Invalid date/time");
  return d.toJSDate();
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
