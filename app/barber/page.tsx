import Link from "next/link";
import { DateTime } from "luxon";
import { PageTitle } from "@/components/dash/Shell";
import { PendingList, type PendingRow } from "@/components/dash/PendingList";
import { StatusBadge } from "@/components/ui";
import { requireBarber } from "@/lib/auth";
import { runExpirySweep } from "@/lib/booking";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtTime } from "@/lib/time";

export const metadata = { title: "Today" };

export default async function BarberHome() {
  const u = await requireBarber();
  await runExpirySweep().catch(() => 0);
  const s = await getSettings();
  const now = DateTime.now().setZone(s.timezone);
  const [pending, upcoming] = await Promise.all([
    q<PendingRow>(`SELECT a.id, a.customer_name, a.service_name, a.start_at, a.expires_at, a.source, a.customer_message, '' barber_name FROM appointments a
       WHERE a.barber_id = $1 AND a.status = 'PENDING' ORDER BY a.start_at`, [u.barber_id]),
    q(`SELECT id, start_at, end_at, status, customer_name, service_name, reschedule_requested FROM appointments
       WHERE barber_id = $1 AND status IN ('CONFIRMED','PENDING') AND end_at > $2 AND start_at < $3 ORDER BY start_at`,
      [u.barber_id, now.startOf("day").toJSDate(), now.plus({ days: 7 }).endOf("day").toJSDate()]),
  ]);
  const byDay = new Map<string, any[]>();
  for (const a of upcoming) {
    const k = fmtDate(a.start_at, s.timezone, "yyyy-MM-dd");
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  return (
    <>
      <PageTitle title={`Hello, ${u.name.split(" ")[0]}`} actions={<><Link href="/barber/appointments/new" className="btn-gold">Add booking</Link><Link href="/barber/calendar" className="btn-line">My calendar</Link></>}>
        {now.toFormat("cccc d LLLL")}
      </PageTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Requests waiting for you {pending.length > 0 && <span className="ml-1 rounded-full bg-brass px-2 text-sm">{pending.length}</span>}</h2>
          <PendingList rows={pending} zone={s.timezone} apptPath="/barber/appointments" showBarber={false} />
        </section>
        <section className="panel">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Next 7 days</h2>
          {upcoming.length === 0 ? <p className="px-5 py-6 text-sm text-smoke">No upcoming appointments.</p> : (
            <div className="divide-y divide-line">
              {[...byDay.entries()].map(([d, list]) => (
                <div key={d} className="px-5 py-3">
                  <p className="mb-2 text-sm font-semibold">{d === now.toISODate() ? "Today" : DateTime.fromISO(d).toFormat("cccc d LLL")}</p>
                  <ul className="space-y-1">
                    {list.map((a: any) => (
                      <li key={a.id}>
                        <Link href={`/barber/appointments/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1.5 text-sm hover:bg-mist">
                          <span className="w-12 font-semibold tabular-nums">{fmtTime(a.start_at, s.timezone)}</span>
                          <span className="flex-1"><span className="block">{a.customer_name}</span><span className="block text-smoke">{a.service_name}</span>{a.reschedule_requested && <span className="block text-xs font-semibold text-amber-800">Change requested</span>}</span>
                          <StatusBadge status={a.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
