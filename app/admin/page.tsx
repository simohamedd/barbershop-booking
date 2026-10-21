import Link from "next/link";
import { DateTime } from "luxon";
import { PageTitle } from "@/components/dash/Shell";
import { PendingList, type PendingRow } from "@/components/dash/PendingList";
import { StatusBadge } from "@/components/ui";
import { loadDay } from "@/lib/availability";
import { runExpirySweep } from "@/lib/booking";
import { q } from "@/lib/db";
import { formatMoney, getSettings } from "@/lib/settings";
import { fmtTime } from "@/lib/time";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await runExpirySweep().catch(() => 0);
  const s = await getSettings();
  const zone = s.timezone;
  const now = DateTime.now().setZone(zone);
  const dayStart = now.startOf("day"), dayEnd = dayStart.plus({ days: 1 });
  const weekStart = now.startOf("week"), monthStart = now.startOf("month");

  const [todayRows, pending, perBarber, stats, daily, barbers] = await Promise.all([
    q(`SELECT a.id, a.start_at, a.end_at, a.status, a.customer_name, a.service_name, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id
       WHERE a.start_at >= $1 AND a.start_at < $2 AND a.status NOT IN ('REJECTED','EXPIRED') ORDER BY a.start_at`, [dayStart.toJSDate(), dayEnd.toJSDate()]),
    q<PendingRow>(`SELECT a.id, a.customer_name, a.service_name, a.start_at, a.expires_at, a.source, a.customer_message, b.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id
       WHERE a.status = 'PENDING' ORDER BY a.start_at LIMIT 20`),
    q(`SELECT b.id, b.name,
         count(a.id) FILTER (WHERE a.start_at >= $1 AND a.start_at < $2 AND a.status IN ('PENDING','CONFIRMED','COMPLETED')) AS today,
         count(a.id) FILTER (WHERE a.start_at >= $3 AND a.start_at < $3::timestamptz + interval '7 days' AND a.status IN ('PENDING','CONFIRMED','COMPLETED')) AS week,
         count(a.id) FILTER (WHERE a.start_at >= $4 AND a.start_at < $4::timestamptz + interval '1 month' AND a.status IN ('PENDING','CONFIRMED','COMPLETED')) AS month
       FROM barbers b LEFT JOIN appointments a ON a.barber_id = b.id WHERE b.deleted_at IS NULL AND b.active GROUP BY b.id ORDER BY b.sort_order, b.name`,
      [dayStart.toJSDate(), dayEnd.toJSDate(), weekStart.toJSDate(), monthStart.toJSDate()]),
    q(`SELECT
         count(*) FILTER (WHERE start_at >= $1 AND start_at < $2 AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')) AS today,
         count(*) FILTER (WHERE start_at >= $3 AND start_at < $3::timestamptz + interval '7 days' AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')) AS week,
         count(*) FILTER (WHERE start_at >= $4 AND start_at < $4::timestamptz + interval '1 month' AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')) AS month,
         count(*) FILTER (WHERE status = 'PENDING') AS pending,
         count(*) FILTER (WHERE status = 'CONFIRMED' AND start_at >= now()) AS confirmed,
         count(*) FILTER (WHERE status = 'COMPLETED' AND start_at >= $4) AS completed,
         count(*) FILTER (WHERE status = 'CANCELLED' AND start_at >= $4) AS cancelled,
         count(*) FILTER (WHERE status = 'NO_SHOW' AND start_at >= $4) AS no_show,
         coalesce(sum(price_pence) FILTER (WHERE status = 'COMPLETED' AND start_at >= $4), 0) AS revenue
       FROM appointments`, [dayStart.toJSDate(), dayEnd.toJSDate(), weekStart.toJSDate(), monthStart.toJSDate()]),
    q<{ d: string; n: number }>(`SELECT to_char(start_at AT TIME ZONE $3, 'YYYY-MM-DD') d, count(*)::int n FROM appointments
       WHERE start_at >= $1 AND start_at < $2 AND status IN ('PENDING','CONFIRMED','COMPLETED','NO_SHOW') GROUP BY 1`,
      [dayStart.minus({ days: 6 }).toJSDate(), dayStart.plus({ days: 8 }).toJSDate(), zone]),
    q<{ id: string; name: string }>(`SELECT id, name FROM barbers WHERE active AND deleted_at IS NULL ORDER BY sort_order, name`),
  ]);
  const st = stats[0];

  // Who is free right now
  const ctx = await loadDay(now.toISODate()!, { barberIds: barbers.map((b) => b.id), settings: s });
  const t = +now.toJSDate();
  const live = barbers.map((b) => {
    const d = ctx.barbers.get(b.id)!;
    const busy = d.busy.find((x) => x.start <= t && t < x.end);
    const off = d.timeOff.find((x) => x.start <= t && t < x.end);
    const brk = d.breaks.find((x) => x.start <= t && t < x.end);
    const working = d.windows.some((w) => w.start <= t && t < w.end);
    const nextAppt = d.busy.filter((x) => x.start > t).sort((a, c) => a.start - c.start)[0];
    if (!working || off) return { ...b, state: "off", text: off ? "Unavailable" : "Not working now" };
    if (busy) return { ...b, state: "busy", text: `With a customer until ${fmtTime(new Date(busy.end), zone)}` };
    if (brk) return { ...b, state: "break", text: `On ${brk.label.toLowerCase()} until ${fmtTime(new Date(brk.end), zone)}` };
    return { ...b, state: "free", text: nextAppt ? `Free until ${fmtTime(new Date(nextAppt.start), zone)}` : "Free for the rest of the day" };
  });

  const days = Array.from({ length: 14 }, (_, i) => dayStart.minus({ days: 6 }).plus({ days: i }));
  const maxN = Math.max(1, ...daily.map((d) => d.n));

  return (
    <>
      <PageTitle title="Dashboard" actions={<><Link href="/admin/appointments/new" className="btn-gold">Add appointment</Link><Link href="/admin/calendar" className="btn-line">Open calendar</Link></>}>
        {now.toFormat("cccc d LLLL")}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today" value={st.today} href={`/admin/calendar?view=day&date=${now.toISODate()}`} />
        <Stat label="Waiting for approval" value={st.pending} href="/admin/appointments?status=PENDING" accent={Number(st.pending) > 0} />
        <Stat label="Upcoming confirmed" value={st.confirmed} href="/admin/appointments?status=CONFIRMED&upcoming=1" />
        <Stat label="This week" value={st.week} href={`/admin/calendar?view=week&date=${now.toISODate()}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Booking requests</h2>
          <PendingList rows={pending} zone={zone} apptPath="/admin/appointments" showBarber />
        </section>
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Chairs right now</h2>
          <ul className="divide-y divide-line">
            {live.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${b.state === "free" ? "bg-emerald-500" : b.state === "busy" ? "bg-ink" : b.state === "break" ? "bg-amber-500" : "bg-neutral-300"}`} aria-hidden />
                  {b.name}
                </span>
                <span className="text-right text-smoke">{b.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Today's appointments</h2>
          {todayRows.length === 0 ? <p className="px-5 py-6 text-sm text-smoke">Nothing booked today yet.</p> : (
            <ul className="divide-y divide-line">
              {todayRows.map((a: any) => (
                <li key={a.id}>
                  <Link href={`/admin/appointments/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-mist">
                    <span className="w-24 font-semibold tabular-nums">{fmtTime(a.start_at, zone)}–{fmtTime(a.end_at, zone)}</span>
                    <span className="min-w-0 flex-1"><span className="font-semibold">{a.customer_name}</span> <span className="text-smoke">· {a.service_name} · {a.barber_name}</span></span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Bookings per barber</h2>
          <table className="table">
            <thead><tr><th>Barber</th><th className="text-right">Today</th><th className="text-right">This week</th><th className="text-right">This month</th></tr></thead>
            <tbody>
              {perBarber.map((b: any) => (
                <tr key={b.id}><td><Link className="font-semibold hover:underline" href={`/admin/calendar?view=week&barber=${b.id}`}>{b.name}</Link></td><td className="text-right tabular-nums">{b.today}</td><td className="text-right tabular-nums">{b.week}</td><td className="text-right tabular-nums">{b.month}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Bookings by day</h2>
          <p className="text-sm text-smoke">Last 7 days and next 7 days</p>
        </div>
        <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label="Bookings per day for the last and next seven days">
          {days.map((d) => {
            const n = daily.find((x) => x.d === d.toISODate())?.n ?? 0;
            const isToday = d.hasSame(now, "day");
            return (
              <Link key={d.toISODate()} href={`/admin/calendar?view=day&date=${d.toISODate()}`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.toFormat("ccc d LLL")}: ${n}`}>
                <span className="text-[11px] tabular-nums text-smoke group-hover:text-ink">{n || ""}</span>
                <span className={`w-full rounded-t ${isToday ? "bg-brass" : d < dayStart ? "bg-neutral-300" : "bg-ink"}`} style={{ height: `${(n / maxN) * 75}%`, minHeight: n ? 4 : 1 }} />
                <span className={`text-[11px] ${isToday ? "font-bold" : "text-smoke"}`}>{d.toFormat("ccccc")}</span>
              </Link>
            );
          })}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-5">
          <div><dt className="text-smoke">This month</dt><dd className="text-xl font-semibold tabular-nums">{st.month}</dd></div>
          <div><dt className="text-smoke">Completed</dt><dd className="text-xl font-semibold tabular-nums">{st.completed}</dd></div>
          <div><dt className="text-smoke">Cancelled</dt><dd className="text-xl font-semibold tabular-nums">{st.cancelled}</dd></div>
          <div><dt className="text-smoke">No-shows</dt><dd className="text-xl font-semibold tabular-nums">{st.no_show}</dd></div>
          <div><dt className="text-smoke">Completed takings</dt><dd className="text-xl font-semibold tabular-nums">{formatMoney(Number(st.revenue), s.currency)}</dd></div>
        </dl>
      </section>
    </>
  );
}

function Stat({ label, value, href, accent }: { label: string; value: number | string; href: string; accent?: boolean }) {
  return (
    <Link href={href} className={`panel block p-4 hover:border-ink ${accent ? "border-brass bg-brass/10" : ""}`}>
      <p className="text-sm text-smoke">{label}</p>
      <p className="display mt-1 text-4xl tabular-nums">{value}</p>
    </Link>
  );
}
