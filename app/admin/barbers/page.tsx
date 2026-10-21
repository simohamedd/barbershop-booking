import Link from "next/link";
import { PageTitle } from "@/components/dash/Shell";
import { Avatar, Flash } from "@/components/ui";
import { q } from "@/lib/db";

export const metadata = { title: "Barbers" };

export default async function Barbers({ searchParams }: { searchParams: Promise<{ removed?: string }> }) {
  const sp = await searchParams;
  const rows = await q(
    `SELECT b.*, u.email, u.active AS login_active, u.role,
       (SELECT count(*) FROM barber_services bs WHERE bs.barber_id = b.id)::int AS services,
       (SELECT count(*) FROM appointments a WHERE a.barber_id = b.id AND a.status IN ('PENDING','CONFIRMED') AND a.start_at > now())::int AS upcoming
     FROM barbers b LEFT JOIN users u ON u.barber_id = b.id WHERE b.deleted_at IS NULL ORDER BY b.sort_order, b.name`);
  return (
    <>
      <PageTitle title="Barbers" actions={<Link href="/admin/barbers/new" className="btn-gold">Add barber</Link>} />
      {sp.removed && <div className="mb-4"><Flash>Barber removed.</Flash></div>}
      <div className="panel overflow-x-auto">
        <table className="table min-w-[44rem]">
          <thead><tr><th>Barber</th><th>Status</th><th>Login</th><th className="text-right">Services</th><th className="text-right">Upcoming</th><th /></tr></thead>
          <tbody>
            {rows.map((b: any) => (
              <tr key={b.id}>
                <td><Link href={`/admin/barbers/${b.id}`} className="flex items-center gap-3 font-semibold hover:underline"><Avatar name={b.name} photo={b.photo} size={36} />{b.name}</Link></td>
                <td>{b.active ? <span className="text-emerald-700">Taking bookings</span> : <span className="text-smoke">Inactive</span>}</td>
                <td className="text-sm">{b.email ? <>{b.email}{b.role === "ADMIN" && <span className="ml-1 text-xs text-brass-dark">(admin)</span>}{!b.login_active && <span className="ml-1 text-xs text-red-700">(disabled)</span>}</> : <span className="text-smoke">No login yet</span>}</td>
                <td className="text-right tabular-nums">{b.services}</td>
                <td className="text-right tabular-nums">{b.upcoming}</td>
                <td className="text-right"><Link href={`/admin/calendar?view=week&barber=${b.id}`} className="text-sm underline">Calendar</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-smoke">No barbers yet. Add your first barber to start taking bookings.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
