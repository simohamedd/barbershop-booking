import Link from "next/link";
import { PageTitle } from "@/components/dash/Shell";
import { SOURCE_LABEL, STATUS_META, StatusBadge } from "@/components/ui";
import { activeBarbers } from "@/lib/dash-data";
import { q } from "@/lib/db";
import { formatMoney, getSettings } from "@/lib/settings";
import { fmtDate, fmtTime, localToDate } from "@/lib/time";

export const metadata = { title: "Appointments" };
const PAGE = 50;

export default async function Appointments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [s, barbers] = await Promise.all([getSettings(), activeBarbers()]);
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (sp.barber) add("a.barber_id = ?::uuid", sp.barber);
  if (sp.status && STATUS_META[sp.status]) add("a.status = ?::appointment_status", sp.status);
  if (sp.from) try { add("a.start_at >= ?", localToDate(sp.from, "00:00", s.timezone)); } catch {}
  if (sp.to) try { add("a.start_at < ?::timestamptz + interval '1 day'", localToDate(sp.to, "00:00", s.timezone)); } catch {}
  if (sp.upcoming) where.push("a.start_at >= now()");
  if (sp.q) add("(a.customer_name ILIKE ? OR c.phone ILIKE $X OR a.reference ILIKE $X)".replace(/\$X/g, `$${args.length + 1}`), `%${sp.q.trim()}%`);
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await q(
    `SELECT a.id, a.reference, a.start_at, a.status, a.source, a.customer_name, a.service_name, a.price_pence, a.reschedule_requested, c.phone, b.name AS barber_name
     FROM appointments a JOIN customers c ON c.id = a.customer_id JOIN barbers b ON b.id = a.barber_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.start_at ${sp.upcoming || sp.status === "PENDING" ? "ASC" : "DESC"} LIMIT ${PAGE + 1} OFFSET ${(page - 1) * PAGE}`,
    args,
  );
  const more = rows.length > PAGE;
  const qs = (o: Record<string, string | number | undefined>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]).toString();

  return (
    <>
      <PageTitle title="Appointments" actions={<Link href="/admin/appointments/new" className="btn-gold">Add appointment</Link>} />
      <form className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <div className="lg:col-span-2"><label className="label text-xs" htmlFor="f-q">Customer, phone or reference</label><input id="f-q" name="q" defaultValue={sp.q} className="field py-2" /></div>
        <div><label className="label text-xs" htmlFor="f-b">Barber</label><select id="f-b" name="barber" defaultValue={sp.barber ?? ""} className="field py-2"><option value="">All</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label text-xs" htmlFor="f-s">Status</label><select id="f-s" name="status" defaultValue={sp.status ?? ""} className="field py-2"><option value="">All</option>{Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label text-xs" htmlFor="f-from">From</label><input id="f-from" type="date" name="from" defaultValue={sp.from} className="field py-2" /></div>
        <div><label className="label text-xs" htmlFor="f-to">To</label><input id="f-to" type="date" name="to" defaultValue={sp.to} className="field py-2" /></div>
        <div className="flex gap-2 lg:col-span-6"><button className="btn-dark btn-sm">Filter</button><Link href="/admin/appointments" className="btn-line btn-sm">Clear</Link></div>
      </form>
      <div className="panel overflow-x-auto">
        <table className="table min-w-[52rem]">
          <thead><tr><th>When</th><th>Customer</th><th>Service</th><th>Barber</th><th>Via</th><th>Status</th><th className="text-right">Price</th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE).map((a: any) => (
              <tr key={a.id} className="hover:bg-mist">
                <td><Link href={`/admin/appointments/${a.id}`} className="font-semibold hover:underline">{fmtDate(a.start_at, s.timezone, "ccc d LLL")}, {fmtTime(a.start_at, s.timezone)}</Link><span className="block text-xs text-smoke">{a.reference}</span></td>
                <td>{a.customer_name}<span className="block text-xs text-smoke">{a.phone}</span></td>
                <td>{a.service_name}</td>
                <td>{a.barber_name}</td>
                <td>{SOURCE_LABEL[a.source]}</td>
                <td><StatusBadge status={a.status} />{a.reschedule_requested && ["PENDING", "CONFIRMED"].includes(a.status) && <span className="mt-1 block text-xs font-semibold text-amber-800">Change requested</span>}</td>
                <td className="text-right tabular-nums">{formatMoney(a.price_pence, s.currency)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-smoke">No appointments match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        {page > 1 && <Link className="btn-line btn-sm" href={qs({ page: page - 1 })}>Previous</Link>}
        {more && <Link className="btn-line btn-sm" href={qs({ page: page + 1 })}>Next</Link>}
      </div>
    </>
  );
}
