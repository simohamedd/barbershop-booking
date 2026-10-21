import Link from "next/link";
import { DateTime } from "luxon";
import { loadDay } from "@/lib/availability";
import { q } from "@/lib/db";
import type { Settings } from "@/lib/settings";
import { STATUS_META } from "@/components/ui";
import { CalendarToolbar } from "./CalendarToolbar";

export type CalView = "day" | "week" | "month";
const HOUR_PX = 64;

type Appt = { id: string; barber_id: string; start_at: Date; end_at: Date; status: string; customer_name: string; service_name: string; reschedule_requested: boolean };

const BLOCK: Record<string, string> = {
  PENDING: "border-amber-500 border-dashed bg-amber-50 text-amber-950",
  CONFIRMED: "border-ink bg-ink text-white",
  COMPLETED: "border-sky-300 bg-sky-50 text-sky-950",
  NO_SHOW: "border-rose-300 bg-rose-50 text-rose-950",
};

async function appointmentsBetween(from: Date, to: Date, barberIds: string[]): Promise<Appt[]> {
  return q<Appt>(
    `SELECT id, barber_id, start_at, end_at, status, customer_name, service_name, reschedule_requested FROM appointments
     WHERE barber_id = ANY($1) AND start_at < $3 AND end_at > $2 AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')
     ORDER BY start_at`,
    [barberIds, from, to],
  );
}

export async function Calendar(props: {
  settings: Settings;
  view: CalView;
  date: string;
  barbers: { id: string; name: string }[]; // columns (day view) / filter options
  focusBarberId: string | null;             // week/month: one barber (null = all, month only)
  basePath: string;                          // e.g. /admin/calendar
  apptPath: string;                          // e.g. /admin/appointments
  allowAll: boolean;
}) {
  const { settings: s, view, basePath } = props;
  const zone = s.timezone;
  const day = DateTime.fromISO(props.date, { zone }).startOf("day");
  const today = DateTime.now().setZone(zone).toISODate()!;

  let title = "";
  let prev = "", next = "";
  if (view === "day") { title = day.toFormat("cccc d LLLL yyyy"); prev = day.minus({ days: 1 }).toISODate()!; next = day.plus({ days: 1 }).toISODate()!; }
  if (view === "week") {
    const ws = day.startOf("week");
    title = `${ws.toFormat("d LLL")} – ${ws.plus({ days: 6 }).toFormat("d LLL yyyy")}`;
    prev = ws.minus({ weeks: 1 }).toISODate()!; next = ws.plus({ weeks: 1 }).toISODate()!;
  }
  if (view === "month") { title = day.toFormat("LLLL yyyy"); prev = day.minus({ months: 1 }).startOf("month").toISODate()!; next = day.plus({ months: 1 }).startOf("month").toISODate()!; }

  const toolbar = (
    <CalendarToolbar basePath={basePath} view={view} date={props.date} today={today} prev={prev} next={next} title={title}
      barbers={props.barbers} barberId={props.focusBarberId} allowAll={props.allowAll} />
  );

  if (view === "month") return <>{toolbar}<MonthGrid {...props} day={day} today={today} /></>;

  // Day or week: columns
  const columns: { key: string; label: string; sub?: string; barberId: string; date: DateTime }[] =
    view === "day"
      ? (props.focusBarberId ? props.barbers.filter((b) => b.id === props.focusBarberId) : props.barbers).map((b) => ({ key: b.id, label: b.name, barberId: b.id, date: day }))
      : Array.from({ length: 7 }, (_, i) => {
          const d = day.startOf("week").plus({ days: i });
          return { key: d.toISODate()!, label: d.toFormat("ccc d"), barberId: props.focusBarberId!, date: d };
        });

  if (!columns.length || !columns[0].barberId) return <>{toolbar}<p className="panel p-6 text-smoke">Add a barber to see the calendar.</p></>;

  const ctxs = await Promise.all(columns.map((c) => loadDay(c.date.toISODate()!, { barberIds: [c.barberId], settings: s })));
  const rangeFrom = columns[0].date.toJSDate();
  const rangeTo = columns[columns.length - 1].date.plus({ days: 1 }).toJSDate();
  const appts = await appointmentsBetween(rangeFrom, rangeTo, [...new Set(columns.map((c) => c.barberId))]);

  // Visible hours: from earliest working start to latest end (default 9–19), padded by an hour
  let minM = 9 * 60, maxM = 19 * 60;
  const lm = (ms: number) => { const d = DateTime.fromMillis(ms, { zone }); return d.hour * 60 + d.minute; };
  ctxs.forEach((ctx) => ctx.barbers.forEach((b) => b.windows.forEach((w) => { minM = Math.min(minM, lm(w.start)); maxM = Math.max(maxM, lm(w.end) || 24 * 60); })));
  appts.forEach((a) => { minM = Math.min(minM, lm(+a.start_at)); maxM = Math.max(maxM, lm(+a.end_at) || 24 * 60); });
  const startH = Math.max(0, Math.floor(minM / 60) - 1);
  const endH = Math.min(24, Math.ceil(maxM / 60) + 1);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const height = hours.length * HOUR_PX;
  const y = (dt: DateTime, colDay: DateTime) => ((dt.diff(colDay, "minutes").minutes - startH * 60) / 60) * HOUR_PX;

  const nowDt = DateTime.now().setZone(zone);

  return (
    <>
      {toolbar}
      <div className="panel overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(9.5rem, 1fr))`, minWidth: `${3.5 + columns.length * 9.5}rem` }}>
          <div className="sticky left-0 z-10 border-b border-line bg-white" />
          {columns.map((c) => {
            const isToday = c.date.toISODate() === today;
            const link = view === "week" ? `${basePath}?view=day&date=${c.key}${props.focusBarberId ? `&barber=${props.focusBarberId}` : ""}` : `${basePath}?view=week&date=${props.date}&barber=${c.barberId}`;
            return (
              <Link key={c.key} href={link} className={`border-b border-l border-line px-3 py-2.5 text-sm font-semibold hover:bg-mist ${isToday && view === "week" ? "text-brass-dark" : ""}`}>{c.label}</Link>
            );
          })}
          {/* hour labels */}
          <div className="sticky left-0 z-10 bg-white" style={{ height }}>
            {hours.map((h) => (
              <div key={h} className="relative border-t border-line text-right text-[11px] text-smoke" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 bg-white px-0.5">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {columns.map((c, i) => {
            const b = ctxs[i].barbers.get(c.barberId);
            const cd = c.date;
            const colAppts = appts.filter((a) => a.barber_id === c.barberId && DateTime.fromJSDate(a.start_at).setZone(zone).hasSame(cd, "day"));
            return (
              <div key={c.key} className="relative border-l border-line" style={{ height, background: "repeating-linear-gradient(135deg,#f6f6f5 0 6px,#efefee 6px 12px)" }}>
                {/* working windows (white) */}
                {b?.windows.map((w, k) => {
                  const top = y(DateTime.fromMillis(w.start, { zone }), cd), h = ((w.end - w.start) / 3_600_000) * HOUR_PX;
                  return <div key={k} className="absolute inset-x-0 bg-white" style={{ top, height: h }} />;
                })}
                {hours.map((h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: (h - startH) * HOUR_PX }} />)}
                {/* breaks and time off */}
                {[...(b?.breaks ?? []).map((x) => ({ ...x, label: x.label })), ...(b?.timeOff ?? []).map((x) => ({ ...x, label: x.reason || (x.kind === "CLOSURE" ? "Shop closed" : "Unavailable") }))].map((x, k) => {
                  const st = Math.max(x.start, +cd.toJSDate()), en = Math.min(x.end, +cd.plus({ days: 1 }).toJSDate());
                  if (en <= st) return null;
                  const top = Math.max(0, y(DateTime.fromMillis(st, { zone }), cd));
                  const h = Math.min(height - top, ((en - st) / 3_600_000) * HOUR_PX);
                  return (
                    <div key={`x${k}`} className="absolute inset-x-0 flex items-start px-2 pt-1 text-[11px] text-smoke" style={{ top, height: h, background: "repeating-linear-gradient(135deg,#efefee 0 6px,#e6e6e4 6px 12px)" }}>
                      {x.label}
                    </div>
                  );
                })}
                {/* now line */}
                {nowDt.hasSame(cd, "day") && (() => { const t = y(nowDt, cd); return t > 0 && t < height ? <div className="absolute inset-x-0 z-20 border-t-2 border-brass" style={{ top: t }} aria-label="Now" /> : null; })()}
                {/* appointments */}
                {colAppts.map((a) => {
                  const st = DateTime.fromJSDate(a.start_at).setZone(zone), en = DateTime.fromJSDate(a.end_at).setZone(zone);
                  const top = y(st, cd), h = Math.max(22, (en.diff(st, "minutes").minutes / 60) * HOUR_PX - 2);
                  return (
                    <Link key={a.id} href={`${props.apptPath}/${a.id}`}
                      className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border px-2 py-1 text-xs leading-tight shadow-sm hover:ring-2 hover:ring-brass ${BLOCK[a.status] ?? ""}`}
                      style={{ top: top + 1, height: h }}
                      title={`${st.toFormat("HH:mm")}–${en.toFormat("HH:mm")} ${a.customer_name}, ${a.service_name} (${STATUS_META[a.status]?.label})`}>
                      <span className="font-semibold tabular-nums">{st.toFormat("HH:mm")}</span> <span className="font-semibold">{a.customer_name}</span>
                      {h > 34 && <span className="block truncate opacity-80">{a.service_name}{a.status === "PENDING" ? " · needs approval" : ""}</span>}
                      {a.reschedule_requested && h > 48 && <span className="block truncate font-semibold">Change requested</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <Legend />
    </>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-smoke">
      <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-ink" /> Confirmed</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-dashed border-amber-500 bg-amber-50" /> Pending approval (holds the slot)</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-sky-300 bg-sky-50" /> Completed</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: "repeating-linear-gradient(135deg,#efefee 0 3px,#e3e3e1 3px 6px)" }} /> Not working, break or blocked</span>
    </div>
  );
}

async function MonthGrid(props: { settings: Settings; day: DateTime; today: string; barbers: { id: string; name: string }[]; focusBarberId: string | null; basePath: string }) {
  const zone = props.settings.timezone;
  const first = props.day.startOf("month");
  const gridStart = first.startOf("week");
  const gridEnd = first.endOf("month").endOf("week");
  const ids = props.focusBarberId ? [props.focusBarberId] : props.barbers.map((b) => b.id);
  const rows = await q<{ d: string; status: string; n: number }>(
    `SELECT to_char(start_at AT TIME ZONE $4, 'YYYY-MM-DD') d, status, count(*)::int n FROM appointments
     WHERE barber_id = ANY($1) AND start_at >= $2 AND start_at < $3 AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')
     GROUP BY 1, 2`,
    [ids, gridStart.toJSDate(), gridEnd.plus({ days: 1 }).toJSDate(), zone],
  );
  const days: DateTime[] = [];
  for (let d = gridStart; d <= gridEnd; d = d.plus({ days: 1 })) days.push(d);
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-mist text-center text-xs font-semibold text-smoke">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const iso = d.toISODate()!;
          const r = rows.filter((x) => x.d === iso);
          const total = r.reduce((a, x) => a + x.n, 0);
          const pending = r.find((x) => x.status === "PENDING")?.n ?? 0;
          const inMonth = d.month === first.month;
          return (
            <Link key={iso} href={`${props.basePath}?view=day&date=${iso}${props.focusBarberId ? `&barber=${props.focusBarberId}` : ""}`}
              className={`min-h-24 border-b border-r border-line p-2 text-sm hover:bg-mist ${inMonth ? "" : "bg-mist/60 text-smoke"}`}>
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full tabular-nums ${iso === props.today ? "bg-ink font-semibold text-white" : ""}`}>{d.day}</span>
              {total > 0 && <span className="mt-1 block text-xs font-semibold">{total} booking{total === 1 ? "" : "s"}</span>}
              {pending > 0 && <span className="block text-xs text-amber-700">{pending} pending</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
