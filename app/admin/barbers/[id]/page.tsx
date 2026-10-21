import Link from "next/link";
import { notFound } from "next/navigation";
import { createLogin, removeBarber, resetPassword, setBarberFlags, setBarberServices, updateLogin } from "@/app/admin/actions";
import { BarberProfileForm } from "@/components/dash/BarberProfileForm";
import { ActionForm, Submit } from "@/components/dash/forms";
import { PageTitle } from "@/components/dash/Shell";
import { Flash } from "@/components/ui";
import { q, q1 } from "@/lib/db";

export const metadata = { title: "Barber" };

export default async function BarberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await q1<any>(`SELECT * FROM barbers WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!b) notFound();
  const [services, assigned, login] = await Promise.all([
    q<{ id: string; name: string; active: boolean }>(`SELECT id, name, active FROM services WHERE deleted_at IS NULL ORDER BY sort_order, name`),
    q<{ service_id: string }>(`SELECT service_id FROM barber_services WHERE barber_id = $1`, [id]),
    q1<any>(`SELECT id, email, role, active, last_login_at FROM users WHERE barber_id = $1`, [id]),
  ]);
  const has = new Set(assigned.map((a) => a.service_id));

  return (
    <>
      <PageTitle title={b.name} actions={<><Link href={`/admin/hours/${id}`} className="btn-dark">Working hours & days off</Link><Link href={`/admin/calendar?view=week&barber=${id}`} className="btn-line">Calendar</Link></>} />
      {sp.created && <div className="mb-4"><Flash>Barber added. Next: check their services, set their hours, and create a login.</Flash></div>}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="panel p-5"><h2 className="mb-4 font-semibold">Profile</h2><BarberProfileForm b={b} /></section>
        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-semibold">Services</h2>
            <p className="mt-1 text-sm text-smoke">Customers can only book {b.name.split(" ")[0]} for ticked services.</p>
            <ActionForm action={setBarberServices} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="service" value={s.id} defaultChecked={has.has(s.id)} />{s.name}{!s.active && <span className="text-xs text-smoke">(hidden)</span>}</label>
                ))}
              </div>
              <div className="mt-4"><Submit className="btn-line">Save services</Submit></div>
            </ActionForm>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Status and permissions</h2>
            <ActionForm action={setBarberFlags} className="mt-3 space-y-2 text-sm">
              <input type="hidden" name="id" value={id} />
              <label className="flex items-start gap-2"><input type="checkbox" name="active" defaultChecked={b.active} className="mt-0.5" /><span><span className="font-semibold">Taking bookings</span><span className="block text-smoke">Untick to hide from the website and stop new bookings.</span></span></label>
              <label className="flex items-start gap-2"><input type="checkbox" name="can_edit_schedule" defaultChecked={b.can_edit_schedule} className="mt-0.5" /><span><span className="font-semibold">Can edit own hours and days off</span><span className="block text-smoke">Otherwise only admins can change their schedule.</span></span></label>
              <div className="pt-2"><Submit className="btn-line">Save</Submit></div>
            </ActionForm>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Login</h2>
            {!login ? (
              <ActionForm action={createLogin} className="mt-3 space-y-3">
                <input type="hidden" name="barber_id" value={id} /><input type="hidden" name="name" value={b.name} /><input type="hidden" name="role" value="BARBER" />
                <p className="text-sm text-smoke">Lets {b.name.split(" ")[0]} see their own diary and approve requests. They can't see other barbers' bookings or the admin area.</p>
                <div><label className="label" htmlFor="l-email">Email</label><input id="l-email" name="email" type="email" required className="field" autoComplete="off" /></div>
                <div><label className="label" htmlFor="l-pw">Temporary password</label><input id="l-pw" name="password" type="text" required minLength={10} className="field" autoComplete="new-password" /><p className="hint">At least 10 characters with a number. They can change it after signing in.</p></div>
                <Submit>Create login</Submit>
              </ActionForm>
            ) : (
              <div className="mt-3 space-y-4">
                <p className="text-sm"><span className="font-semibold">{login.email}</span>{login.last_login_at ? <span className="text-smoke">, last signed in {new Date(login.last_login_at).toLocaleDateString("en-GB")}</span> : <span className="text-smoke">, never signed in</span>}</p>
                <ActionForm action={updateLogin} className="space-y-2 text-sm">
                  <input type="hidden" name="user_id" value={login.id} />
                  <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={login.active} /> Login enabled</label>
                  <label className="flex items-start gap-2"><input type="checkbox" name="admin" defaultChecked={login.role === "ADMIN"} className="mt-0.5" /><span>Admin access <span className="block text-smoke">Full control of the shop, all barbers and settings.</span></span></label>
                  <Submit className="btn-line">Save access</Submit>
                </ActionForm>
                <ActionForm action={resetPassword} className="border-t border-line pt-4" resetOnOk>
                  <input type="hidden" name="user_id" value={login.id} />
                  <label className="label" htmlFor="l-reset">Set a new password</label>
                  <div className="flex gap-2"><input id="l-reset" name="password" type="text" required minLength={10} className="field" autoComplete="new-password" /><Submit className="btn-line">Set</Submit></div>
                </ActionForm>
              </div>
            )}
          </section>

          <section className="panel border-red-200 p-5">
            <h2 className="font-semibold">Remove barber</h2>
            <p className="mt-1 text-sm text-smoke">Removes them from the website and disables their login. Past appointments are kept for your records. Barbers with upcoming appointments can't be removed until those are reassigned or cancelled.</p>
            <ActionForm action={removeBarber} className="mt-3"><input type="hidden" name="id" value={id} /><Submit className="btn-danger" confirm={`Remove ${b.name}? This can't be undone from the dashboard.`}>Remove {b.name.split(" ")[0]}</Submit></ActionForm>
          </section>
        </div>
      </div>
    </>
  );
}
