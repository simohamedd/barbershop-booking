"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { checkManual, createManual, type CheckResult } from "@/app/actions/appointments";

type Service = { id: string; name: string; duration_min: number; price_pence: number };
type Barber = { id: string; name: string; service_ids: string[] };
type Slot = { start: string; time: string; available: boolean; freeBarberIds: string[] };

const SOFT = ["OUTSIDE_HOURS", "BREAK", "TIME_OFF", "TOO_SOON", "TOO_FAR"];

export function ManualBooking(p: {
  area: "admin" | "barber";
  services: Service[];
  barbers: Barber[];
  fixedBarberId?: string;
  today: string;
  isAdmin: boolean;
  currency: string;
  defaults?: { date?: string; time?: string; barberId?: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    serviceId: p.services[0]?.id ?? "",
    barberId: p.fixedBarberId ?? p.defaults?.barberId ?? "any",
    date: p.defaults?.date ?? p.today,
    time: p.defaults?.time ?? "",
    source: "WHATSAPP" as "WHATSAPP" | "PHONE" | "WALK_IN" | "ADMIN",
    status: "CONFIRMED" as "CONFIRMED" | "PENDING",
    notes: "",
    override: false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const qualified = useMemo(() => p.barbers.filter((b) => b.service_ids.includes(form.serviceId)), [p.barbers, form.serviceId]);
  const service = p.services.find((s) => s.id === form.serviceId);

  // Slot chips for the chosen day
  useEffect(() => {
    if (!form.serviceId || !form.date) return;
    let off = false;
    fetch(`/api/availability?serviceId=${form.serviceId}&barberId=${form.barberId}&date=${form.date}&staff=1`)
      .then((r) => r.json()).then((d) => !off && setSlots(d.slots ?? [])).catch(() => !off && setSlots([]));
    return () => { off = true; };
  }, [form.serviceId, form.barberId, form.date]);

  // Live availability check at the requested time
  useEffect(() => {
    setCheck(null);
    if (!form.serviceId || !form.date || !/^\d{2}:\d{2}$/.test(form.time)) return;
    let off = false;
    const t = setTimeout(() => {
      checkManual({ serviceId: form.serviceId, barberId: form.barberId, date: form.date, time: form.time }).then((r) => !off && setCheck(r));
    }, 200);
    return () => { off = true; clearTimeout(t); };
  }, [form.serviceId, form.barberId, form.date, form.time]);

  const chosen = check ? (form.barberId === "any" ? check.barbers : check.barbers.filter((b) => b.id === form.barberId)) : [];
  const freeChosen = chosen.filter((b) => b.issues.length === 0);
  const softOnly = chosen.filter((b) => b.issues.length > 0 && b.issues.every((i) => SOFT.includes(i.code)));
  const canSave = Boolean(check && (freeChosen.length > 0 || (p.isAdmin && form.override && softOnly.length > 0)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSave(async () => {
      const r = await createManual({ ...form, barberId: form.barberId });
      if (r.ok) {
        router.push(`/${p.area}/calendar?view=day&date=${form.date}&created=${r.id}`);
        router.refresh();
      } else {
        setError(r.error);
        // Re-run the check so the panel shows what's free now
        checkManual({ serviceId: form.serviceId, barberId: form.barberId, date: form.date, time: form.time }).then(setCheck);
      }
    });
  }

  const name = (id: string) => p.barbers.find((b) => b.id === id)?.name ?? "";

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        <fieldset className="panel grid gap-4 p-5 sm:grid-cols-2">
          <legend className="sr-only">Customer</legend>
          <h2 className="font-semibold sm:col-span-2">Customer</h2>
          <div><label className="label" htmlFor="m-name">Name</label><input id="m-name" className="field" required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className="label" htmlFor="m-phone">Phone</label><input id="m-phone" className="field" required type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="07700 900123" />
            <p className="hint">Existing customers are matched by phone number.</p></div>
          <div><label className="label" htmlFor="m-email">Email <span className="font-normal text-smoke">(optional)</span></label><input id="m-email" className="field" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label className="label" htmlFor="m-source">Booked via</label>
            <select id="m-source" className="field" value={form.source} onChange={(e) => set("source", e.target.value as typeof form.source)}>
              <option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone call</option><option value="WALK_IN">Walk-in</option><option value="ADMIN">Other</option>
            </select></div>
        </fieldset>

        <fieldset className="panel grid gap-4 p-5 sm:grid-cols-2">
          <legend className="sr-only">Appointment</legend>
          <h2 className="font-semibold sm:col-span-2">Appointment</h2>
          <div><label className="label" htmlFor="m-svc">Service</label>
            <select id="m-svc" className="field" value={form.serviceId} onChange={(e) => set("serviceId", e.target.value)}>
              {p.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_min} min)</option>)}
            </select></div>
          <div><label className="label" htmlFor="m-barber">Barber</label>
            {p.fixedBarberId ? <input id="m-barber" className="field bg-mist" readOnly value={name(p.fixedBarberId)} /> : (
              <select id="m-barber" className="field" value={form.barberId} onChange={(e) => set("barberId", e.target.value)}>
                <option value="any">Any available barber</option>
                {qualified.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}</div>
          <div><label className="label" htmlFor="m-date">Date</label><input id="m-date" className="field" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
          <div><label className="label" htmlFor="m-time">Start time</label><input id="m-time" className="field" type="time" step={300} required value={form.time} onChange={(e) => set("time", e.target.value)} /></div>
          <div className="sm:col-span-2">
            <p className="label">Free times{form.barberId !== "any" ? ` for ${name(form.barberId)}` : ""}</p>
            {slots === null ? <p className="text-sm text-smoke">Loading…</p> : slots.filter((s) => s.available).length === 0 ? <p className="text-sm text-smoke">No free times on this day.</p> : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {slots.filter((s) => s.available).map((s) => (
                  <button key={s.start} type="button" onClick={() => set("time", s.time)}
                    className={`rounded border px-2 py-1 text-xs font-semibold tabular-nums ${form.time === s.time ? "border-brass bg-brass" : "border-line bg-white hover:border-ink"}`}>{s.time}</button>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2"><label className="label" htmlFor="m-notes">Internal note</label>
            <textarea id="m-notes" className="field" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Customer contacted us through WhatsApp" /></div>
        </fieldset>
      </div>

      <div className="space-y-4">
        <div className="panel p-5 xl:sticky xl:top-6">
          <h2 className="font-semibold">Availability check</h2>
          {!form.time ? <p className="mt-2 text-sm text-smoke">Pick a time to check who's free.</p> : !check ? <p className="mt-2 text-sm text-smoke">Checking…</p> : (
            <>
              {check.error && <p className="mt-2 text-sm text-red-700">{check.error}</p>}
              <ul className="mt-3 space-y-2 text-sm">
                {check.barbers.map((b) => {
                  const relevant = form.barberId === "any" || b.id === form.barberId;
                  return (
                    <li key={b.id} className={`flex items-start justify-between gap-3 ${relevant ? "" : "opacity-60"}`}>
                      <span className="font-semibold">{b.name}</span>
                      {b.issues.length === 0 ? (
                        <span className="flex items-center gap-2 text-emerald-700">Free
                          {form.barberId !== "any" && b.id !== form.barberId && !p.fixedBarberId && (
                            <button type="button" className="text-xs underline" onClick={() => set("barberId", b.id)}>Use</button>
                          )}
                        </span>
                      ) : <span className={`text-right ${b.issues.some((i) => !SOFT.includes(i.code)) ? "text-red-700" : "text-amber-800"}`}>{b.issues[0].message}</span>}
                    </li>
                  );
                })}
              </ul>
              {check.ok ? (
                <p role="status" className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {form.barberId === "any" ? `Will be assigned to ${name(freeChosen[0]?.id ?? "")} or another free barber.` : "This time is free."}
                </p>
              ) : (
                <div role="alert" className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">{form.barberId === "any" ? "No barber is free at this time." : `${name(form.barberId)} can't take this time.`}</p>
                  {check.alternatives?.otherBarbersAtTime.length ? (
                    <p className="mt-1">Free at {form.time}: {check.alternatives.otherBarbersAtTime.map((b, i) => (
                      <span key={b.id}>{i > 0 && ", "}{p.fixedBarberId ? b.name : <button type="button" className="font-semibold underline" onClick={() => set("barberId", b.id)}>{b.name}</button>}</span>
                    ))}</p>
                  ) : null}
                  {check.alternatives?.sameBarberTimes.slice(0, 2).map((d) => (
                    <div key={d.date} className="mt-2">
                      <p className="text-xs">{d.date === form.date ? "Other times that day" : DateTime.fromISO(d.date).toFormat("cccc d LLL")}:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d.slots.slice(0, 6).map((s) => <button key={s.start} type="button" className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs" onClick={() => { set("date", d.date); set("time", s.time); }}>{s.time}</button>)}
                      </div>
                    </div>
                  ))}
                  {p.isAdmin && softOnly.length > 0 && (
                    <label className="mt-3 flex items-start gap-2 border-t border-amber-200 pt-3">
                      <input type="checkbox" className="mt-1" checked={form.override} onChange={(e) => set("override", e.target.checked)} />
                      <span>Book anyway outside hours, break or blocked time. Overlapping bookings can never be overridden.</span>
                    </label>
                  )}
                </div>
              )}
            </>
          )}

          <fieldset className="mt-5 border-t border-line pt-4">
            <legend className="label">Save as</legend>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="status" checked={form.status === "CONFIRMED"} onChange={() => set("status", "CONFIRMED")} /> Confirmed</label>
            <label className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="status" checked={form.status === "PENDING"} onChange={() => set("status", "PENDING")} /> Pending barber approval (slot is held)</label>
          </fieldset>
          {service && <p className="mt-3 text-sm text-smoke">{service.name}, {service.duration_min} min, {new Intl.NumberFormat("en-GB", { style: "currency", currency: p.currency }).format(service.price_pence / 100)}</p>}
          {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
          <button type="submit" className="btn-gold mt-4 w-full py-3" disabled={!canSave || saving || form.name.trim().length < 2 || form.phone.trim().length < 7}>
            {saving ? "Saving…" : "Save appointment"}
          </button>
        </div>
      </div>
    </form>
  );
}
