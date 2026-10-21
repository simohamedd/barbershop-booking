import Link from "next/link";
import { notFound } from "next/navigation";
import { saveCustomer } from "@/app/admin/actions";
import { ActionForm, Submit } from "@/components/dash/forms";
import { PageTitle } from "@/components/dash/Shell";
import { SOURCE_LABEL, StatusBadge } from "@/components/ui";
import { q, q1 } from "@/lib/db";
import { formatMoney, getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Customer" };

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await q1<any>(`SELECT * FROM customers WHERE id = $1`, [id]);
  if (!c) notFound();
  const [s, appts] = await Promise.all([
    getSettings(),
    q(`SELECT a.id, a.start_at, a.status, a.service_name, a.price_pence, a.source, b.name barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE customer_id = $1 ORDER BY start_at DESC`, [id]),
  ]);
  return (
    <>
      <PageTitle title={c.name} actions={<Link className="btn-gold" href="/admin/appointments/new">Add appointment</Link>}>{c.phone}</PageTitle>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section className="panel overflow-x-auto">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Appointments</h2>
          <table className="table">
            <thead><tr><th>When</th><th>Service</th><th>Barber</th><th>Via</th><th>Status</th><th className="text-right">Price</th></tr></thead>
            <tbody>
              {appts.map((a: any) => (
                <tr key={a.id}><td><Link className="font-semibold hover:underline" href={`/admin/appointments/${a.id}`}>{fmtDateTime(a.start_at, s.timezone)}</Link></td><td>{a.service_name}</td><td>{a.barber_name}</td><td>{SOURCE_LABEL[a.source]}</td><td><StatusBadge status={a.status} /></td><td className="text-right">{formatMoney(a.price_pence, s.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">Details</h2>
          <ActionForm action={saveCustomer} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <div><label className="label" htmlFor="c-name">Name</label><input id="c-name" name="name" defaultValue={c.name} className="field" /></div>
            <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" name="email" type="email" defaultValue={c.email ?? ""} className="field" /></div>
            <div><label className="label" htmlFor="c-notes">Staff notes</label><textarea id="c-notes" name="notes" rows={4} defaultValue={c.notes} className="field" placeholder="Preferences, e.g. number 2 on the sides" /><p className="hint">Only staff see this.</p></div>
            <Submit>Save</Submit>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
