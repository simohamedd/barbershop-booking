import { createLogin, saveBookingRules, saveShopSettings, updateLogin } from "@/app/admin/actions";
import { ActionForm, Submit } from "@/components/dash/forms";
import { PasswordForm } from "@/components/dash/PasswordForm";
import { PageTitle } from "@/components/dash/Shell";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { emailConfigured, whatsappConfigured } from "@/lib/notify";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Settings" };

function F({ name, label, def, hint, type = "text", wide, ...rest }: { name: string; label: string; def: string | number; hint?: string; type?: string; wide?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={`s-${name}`}>{label}</label>
      <input id={`s-${name}`} name={name} type={type} defaultValue={def} className="field" {...rest} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export default async function Settings() {
  const me = await requireAdmin();
  const [s, admins] = await Promise.all([getSettings(), q(`SELECT id, email, name, active, barber_id FROM users WHERE role = 'ADMIN' ORDER BY created_at`)]);
  const email = emailConfigured(), wa = whatsappConfigured();
  return (
    <>
      <PageTitle title="Settings" />
      <div className="space-y-6">
        <section className="panel p-5">
          <h2 className="font-semibold">Booking rules</h2>
          <ActionForm action={saveBookingRules} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <F name="buffer_minutes" label="Buffer after each appointment (min)" def={s.buffer_minutes} type="number" min={0} max={120} hint="Cleanup time. Blocks the barber after every booking." />
            <div>
              <label className="label" htmlFor="s-int">Time slot interval</label>
              <select id="s-int" name="slot_interval_minutes" defaultValue={s.slot_interval_minutes} className="field">{[5, 10, 15, 20, 30, 60].map((v) => <option key={v} value={v}>Every {v} minutes</option>)}</select>
              <p className="hint">How often start times are offered.</p>
            </div>
            <F name="pending_expiry_minutes" label="Approval window (min)" def={s.pending_expiry_minutes} type="number" min={5} max={10080} hint="A request holds its slot this long. If not approved, the slot is released." />
            <F name="min_notice_minutes" label="Minimum notice (min)" def={s.min_notice_minutes} type="number" min={0} hint="Customers can't book later than this before a start time." />
            <F name="max_advance_days" label="Book up to (days ahead)" def={s.max_advance_days} type="number" min={1} max={365} />
            <F name="cancellation_cutoff_hours" label="Online cancellation closes (hours before)" def={s.cancellation_cutoff_hours} type="number" min={0} max={168} />
            <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="s-pol">Cancellation policy shown to customers</label><textarea id="s-pol" name="cancellation_policy" rows={2} defaultValue={s.cancellation_policy} className="field" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><input type="checkbox" name="allow_online_booking" defaultChecked={s.allow_online_booking} /> Accept online bookings (untick to pause; staff can still add bookings)</label>
            <div><Submit>Save booking rules</Submit></div>
          </ActionForm>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Shop details</h2>
          <ActionForm action={saveShopSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
            <F name="shop_name" label="Shop name" def={s.shop_name} required />
            <F name="tagline" label="Tagline" def={s.tagline} />
            <div className="sm:col-span-2"><label className="label" htmlFor="s-about">About the shop</label><textarea id="s-about" name="about" rows={2} defaultValue={s.about} className="field" /></div>
            <F name="address" label="Address" def={s.address} wide />
            <F name="phone" label="Phone" def={s.phone} />
            <F name="email" label="Email" def={s.email} />
            <F name="whatsapp_number" label="WhatsApp number" def={s.whatsapp_number} hint="Shown on the website as a chat link." />
            <F name="maps_url" label="Google Maps link" def={s.maps_url} />
            <F name="hero_image_url" label="Homepage photo link" def={s.hero_image_url} wide hint="An https:// image link, shown behind the homepage heading." />
            <F name="logo_url" label="Logo link" def={s.logo_url} hint="Optional square logo (https://)." />
            <F name="timezone" label="Time zone" def={s.timezone} hint="IANA name, e.g. Europe/London. All times use this zone." />
            <F name="currency" label="Currency" def={s.currency} maxLength={3} />
            <div><Submit>Save shop details</Submit></div>
          </ActionForm>
        </section>

        <section id="notifications" className="panel p-5">
          <h2 className="font-semibold">Customer notifications</h2>
          <p className="mt-1 text-sm text-smoke">Staff always get in-app notifications. Customer messages need a provider set up in the hosting environment variables (see the setup guide).</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between gap-4 border-b border-line pb-2"><span className="font-semibold">Email (Resend)</span>{email ? <span className="text-emerald-700">Set up. Customers who give an email are notified.</span> : <span className="text-amber-800">Not set up. No emails are sent.</span>}</li>
            <li className="flex justify-between gap-4 border-b border-line pb-2"><span className="font-semibold">WhatsApp (Business Cloud API)</span>{wa ? <span className="text-emerald-700">Set up. Customers are messaged on WhatsApp.</span> : <span className="text-amber-800">Not set up. No WhatsApp messages are sent.</span>}</li>
            <li className="flex justify-between gap-4"><span className="font-semibold">Booking page</span><span className="text-emerald-700">Always on. Customers see live status at their booking link.</span></li>
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Admins</h2>
          <ul className="mt-3 divide-y divide-line">
            {admins.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="font-semibold">{a.name}</span> <span className="text-smoke">{a.email}</span>{a.id === me.id && <span className="ml-1 text-xs text-brass-dark">(you)</span>}{!a.active && <span className="ml-1 text-xs text-red-700">(disabled)</span>}</span>
                {a.id !== me.id && !a.barber_id && (
                  <ActionForm action={updateLogin} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={a.id} /><input type="hidden" name="admin" value="on" />
                    {a.active ? <Submit className="btn-line btn-sm" confirm="Disable this admin login?">Disable</Submit> : <><input type="hidden" name="active" value="on" /><Submit className="btn-line btn-sm">Enable</Submit></>}
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold underline">Add another admin</summary>
            <ActionForm action={createLogin} className="mt-3 grid gap-3 sm:grid-cols-3" resetOnOk>
              <input type="hidden" name="role" value="ADMIN" />
              <div><label className="label" htmlFor="a-name">Name</label><input id="a-name" name="name" required className="field" /></div>
              <div><label className="label" htmlFor="a-email">Email</label><input id="a-email" name="email" type="email" required className="field" /></div>
              <div><label className="label" htmlFor="a-pw">Temporary password</label><input id="a-pw" name="password" required minLength={10} className="field" autoComplete="new-password" /></div>
              <div><Submit>Add admin</Submit></div>
            </ActionForm>
            <p className="hint">To make a barber an admin, use the Login section on their barber page.</p>
          </details>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 font-semibold">Your password</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
