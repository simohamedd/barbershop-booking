import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import type { SessionUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { formatDuration, formatMoney, getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { SOURCE_LABEL, StatusBadge } from "@/components/ui";
import { ActionForm, Submit } from "./forms";
import { apptNote, apptReschedule, apptTransition } from "@/app/actions/appointments";

export async function AppointmentDetail({ id, user, area }: { id: string; user: SessionUser; area: "admin" | "barber" }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await q1<any>(
    `SELECT a.*, c.phone, c.email, c.id AS cust_id, b.name AS barber_name FROM appointments a
     JOIN customers c ON c.id = a.customer_id JOIN barbers b ON b.id = a.barber_id WHERE a.id = $1`,
    [id],
  );
  if (!a) notFound();
  const isAdmin = area === "admin" && user.role === "ADMIN";
  if (!isAdmin && a.barber_id !== user.barber_id) notFound(); // barbers only see their own

  const [s, hist, deliveries, barbers, services] = await Promise.all([
    getSettings(),
    q(`SELECT * FROM appointment_history WHERE appointment_id = $1 ORDER BY created_at DESC`, [id]),
    q(`SELECT channel, delivery, title, error, created_at FROM notifications WHERE appointment_id = $1 AND customer_id IS NOT NULL ORDER BY created_at DESC`, [id]),
    isAdmin ? q<{ id: string; name: string }>(`SELECT b.id, b.name FROM barbers b JOIN barber_services bs ON bs.barber_id = b.id WHERE bs.service_id = $1 AND b.active AND b.deleted_at IS NULL ORDER BY b.sort_order`, [a.service_id]) : Promise.resolve([]),
    q<{ id: string; name: string; duration_min: number }>(`SELECT id, name, duration_min FROM services WHERE deleted_at IS NULL AND active ORDER BY sort_order`),
  ]);
  const zone = s.timezone;
  const start = DateTime.fromJSDate(a.start_at).setZone(zone);
  const active = ["PENDING", "CONFIRMED"].includes(a.status);
  const started = +a.start_at <= Date.now();
  const wa = String(a.phone).replace(/[^\d]/g, "");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={a.status} />
              <span className="text-sm text-smoke">{a.reference} · {SOURCE_LABEL[a.source]}</span>
            </div>
            {a.status === "PENDING" && a.expires_at && <span className="text-sm text-amber-800">Approve by {fmtDateTime(a.expires_at, zone)} or the slot is released</span>}
          </div>
          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            <Item label="Customer">
              <span className="font-semibold">{a.customer_name}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-sm">
                <a className="underline decoration-brass underline-offset-2" href={`tel:${a.phone}`}>{a.phone}</a>
                <a className="underline decoration-brass underline-offset-2" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                {isAdmin && <Link className="text-smoke underline" href={`/admin/customers/${a.cust_id}`}>History</Link>}
              </span>
              {a.email && <span className="block text-sm text-smoke">{a.email}</span>}
            </Item>
            <Item label="When"><span className="font-semibold">{start.toFormat("cccc d LLLL yyyy")}</span><span className="block text-sm">{start.toFormat("HH:mm")}–{DateTime.fromJSDate(a.end_at).setZone(zone).toFormat("HH:mm")}</span></Item>
            <Item label="Service"><span className="font-semibold">{a.service_name}</span><span className="block text-sm text-smoke">{formatDuration(a.duration_min)} · {formatMoney(a.price_pence, s.currency)}</span></Item>
            <Item label="Barber"><span className="font-semibold">{a.barber_name}</span></Item>
            {a.customer_message && <Item label="Customer's message" wide><span className="whitespace-pre-wrap">{a.customer_message}</span></Item>}
            {a.reschedule_requested && <Item label="Change requested by customer" wide><span className="font-semibold text-amber-900">{a.reschedule_note || "No details given"}</span></Item>}
            <Item label="Internal notes" wide>{a.staff_notes ? <span className="whitespace-pre-wrap text-sm">{a.staff_notes}</span> : <span className="text-sm text-smoke">None yet</span>}</Item>
          </dl>
        </div>

        {active && (
          <div className="panel p-5">
            <h2 className="font-semibold">{isAdmin ? "Reschedule, reassign or change service" : "Move this appointment"}</h2>
            <p className="mt-1 text-sm text-smoke">Uses the same availability rules as online bookings. Overlapping bookings are always refused.</p>
            <ActionForm action={apptReschedule} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="id" value={a.id} />
              <div><label className="label" htmlFor="r-date">Date</label><input id="r-date" name="date" type="date" defaultValue={start.toISODate()!} className="field" /></div>
              <div><label className="label" htmlFor="r-time">Start time</label><input id="r-time" name="time" type="time" step={300} defaultValue={start.toFormat("HH:mm")} className="field" /></div>
              {isAdmin && (
                <div><label className="label" htmlFor="r-barber">Barber</label>
                  <select id="r-barber" name="barberId" defaultValue={a.barber_id} className="field">
                    {!barbers.some((b) => b.id === a.barber_id) && <option value={a.barber_id}>{a.barber_name}</option>}
                    {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></div>
              )}
              <div><label className="label" htmlFor="r-svc">Service</label>
                <select id="r-svc" name="serviceId" defaultValue="" className="field">
                  <option value="">Keep {a.service_name}</option>
                  {services.filter((x) => x.id !== a.service_id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.duration_min} min)</option>)}
                </select></div>
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
                <Submit className="btn-dark">Save changes</Submit>
                {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="override" /> Allow outside working hours, breaks or blocked time</label>}
              </div>
            </ActionForm>
          </div>
        )}

        <div className="panel p-5">
          <h2 className="font-semibold">Add an internal note</h2>
          <ActionForm action={apptNote} className="mt-3" resetOnOk>
            <input type="hidden" name="id" value={a.id} />
            <textarea name="note" rows={2} className="field" maxLength={2000} placeholder="e.g. Customer contacted us through WhatsApp" required />
            <div className="mt-3"><Submit className="btn-line">Add note</Submit></div>
          </ActionForm>
        </div>
      </div>

      <div className="space-y-6">
        <div className="panel p-5">
          <h2 className="font-semibold">Actions</h2>
          <div className="mt-4 space-y-3">
            {a.status === "PENDING" && (
              <>
                <ActionForm action={apptTransition}>
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="approve" />
                  <Submit className="btn-gold w-full">Approve booking</Submit>
                </ActionForm>
                <ActionForm action={apptTransition} className="rounded-md border border-line p-3">
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="reject" />
                  <label className="label text-xs" htmlFor="rej">Reason for the customer (optional)</label>
                  <input id="rej" name="reason" className="field py-2 text-sm" maxLength={300} placeholder="e.g. Fully booked, please try 3pm" />
                  <Submit className="btn-danger mt-2 w-full" confirm="Reject this request and release the slot?">Reject request</Submit>
                </ActionForm>
              </>
            )}
            {a.status === "CONFIRMED" && started && (
              <div className="grid grid-cols-2 gap-2">
                <ActionForm action={apptTransition}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="complete" /><Submit className="btn-dark w-full">Completed</Submit></ActionForm>
                <ActionForm action={apptTransition}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="no_show" /><Submit className="btn-line w-full" confirm="Mark this customer as a no-show?">No-show</Submit></ActionForm>
              </div>
            )}
            {a.status === "CONFIRMED" && !started && <p className="text-sm text-smoke">You can mark it completed or a no-show once it starts.</p>}
            {active && (
              <ActionForm action={apptTransition} className="rounded-md border border-line p-3">
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="cancel" />
                <label className="label text-xs" htmlFor="can">Cancellation reason (optional)</label>
                <input id="can" name="reason" className="field py-2 text-sm" maxLength={300} />
                <Submit className="btn-danger mt-2 w-full" confirm="Cancel this appointment and notify the customer?">Cancel appointment</Submit>
              </ActionForm>
            )}
            {!active && <p className="text-sm text-smoke">No further actions for a {a.status.toLowerCase().replace("_", "-")} appointment.</p>}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-semibold">Customer messages</h2>
          {deliveries.length === 0 ? <p className="mt-2 text-sm text-smoke">None yet.</p> : (
            <ul className="mt-3 space-y-2 text-sm">
              {deliveries.map((d: any, i: number) => (
                <li key={i} className="flex justify-between gap-3">
                  <span><span className="font-semibold">{d.channel === "EMAIL" ? "Email" : "WhatsApp"}</span>: {d.title.replace(/ – BK-.*/, "")}</span>
                  <span className={d.delivery === "SENT" ? "text-emerald-700" : d.delivery === "FAILED" ? "text-red-700" : "text-smoke"} title={d.error ?? ""}>
                    {d.delivery === "SENT" ? "Sent" : d.delivery === "FAILED" ? "Failed" : "Not set up"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-smoke">“Not set up” means no message was sent because email or WhatsApp isn't configured. {isAdmin && <Link href="/admin/settings#notifications" className="underline">Check settings</Link>}</p>
        </div>

        <div className="panel p-5">
          <h2 className="font-semibold">History</h2>
          <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
            {hist.map((h: any) => (
              <li key={h.id}>
                <p><span className="font-semibold capitalize">{h.action}</span>{h.details ? `: ${h.details}` : ""}</p>
                <p className="text-xs text-smoke">{h.actor_label}, {fmtDateTime(h.created_at, zone)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><dt className="mb-1 text-xs text-smoke">{label}</dt><dd>{children}</dd></div>;
}
