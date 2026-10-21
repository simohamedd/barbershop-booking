import Link from "next/link";
import { PageTitle } from "@/components/dash/Shell";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const term = sp.q?.trim() ? `%${sp.q.trim()}%` : null;
  const rows = await q(
    `SELECT c.id, c.name, c.phone, c.email,
       count(a.id) FILTER (WHERE a.status IN ('CONFIRMED','COMPLETED','PENDING'))::int AS visits,
       count(a.id) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_shows,
       max(a.start_at) FILTER (WHERE a.status = 'COMPLETED') AS last_visit,
       min(a.start_at) FILTER (WHERE a.status IN ('PENDING','CONFIRMED') AND a.start_at > now()) AS next_visit
     FROM customers c LEFT JOIN appointments a ON a.customer_id = c.id
     WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1)
     GROUP BY c.id ORDER BY max(a.start_at) DESC NULLS LAST LIMIT 200`, [term]);
  return (
    <>
      <PageTitle title="Customers">Customers are created automatically when they book, matched by phone number.</PageTitle>
      <form className="mb-4 flex max-w-md gap-2" method="get"><label htmlFor="c-q" className="sr-only">Search</label><input id="c-q" name="q" defaultValue={sp.q} placeholder="Name, phone or email" className="field" /><button className="btn-dark">Search</button></form>
      <div className="panel overflow-x-auto">
        <table className="table min-w-[44rem]">
          <thead><tr><th>Customer</th><th>Phone</th><th className="text-right">Bookings</th><th className="text-right">No-shows</th><th>Last visit</th><th>Next</th></tr></thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id} className="hover:bg-mist">
                <td><Link href={`/admin/customers/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>{c.email && <span className="block text-xs text-smoke">{c.email}</span>}</td>
                <td>{c.phone}</td>
                <td className="text-right tabular-nums">{c.visits}</td>
                <td className={`text-right tabular-nums ${c.no_shows ? "text-rose-700" : ""}`}>{c.no_shows}</td>
                <td>{c.last_visit ? fmtDate(c.last_visit, s.timezone, "d LLL yyyy") : "–"}</td>
                <td>{c.next_visit ? fmtDate(c.next_visit, s.timezone, "ccc d LLL") : "–"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-smoke">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
