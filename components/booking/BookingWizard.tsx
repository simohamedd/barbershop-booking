"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";

type Service = { id: string; name: string; description: string; price_pence: number; duration_min: number };
type Barber = { id: string; name: string; title: string; photo: string; specialties: string; service_ids: string[] };
type SlotView = { start: string; time: string; available: boolean; freeBarberIds: string[] };
type DayCount = { date: string; count: number };
type Alternatives = { sameBarberTimes: { date: string; slots: { start: string; time: string }[] }[]; otherBarbersAtTime: { id: string; name: string }[] };

const STEPS = ["Service", "Barber", "Date & time", "Your details"] as const;

function money(p: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: p % 100 ? 2 : 0 }).format(p / 100);
}
function dur(m: number) {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
function initials(n: string) {
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Face({ b, size = 44 }: { b: { name: string; photo?: string }; size?: number }) {
  return b.photo ? (
    <img src={b.photo} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="display inline-flex shrink-0 items-center justify-center rounded-full border border-brass/60 text-brass-dark" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(b.name)}
    </span>
  );
}

export function BookingWizard(props: {
  services: Service[];
  barbers: Barber[];
  currency: string;
  timezone: string;
  shopPhone: string;
  cancellationPolicy: string;
  initialServiceId?: string;
  initialBarberId?: string;
  onlineEnabled: boolean;
}) {
  const { services, barbers, currency, timezone: zone } = props;
  const router = useRouter();
  const initialService = services.find((s) => s.id === props.initialServiceId);
  const initialBarber = barbers.find((b) => b.id === props.initialBarberId);

  const [step, setStep] = useState(initialService ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialService?.id ?? "");
  const [barberId, setBarberId] = useState<string>(initialBarber && (!initialService || initialBarber.service_ids.includes(initialService.id)) ? initialBarber.id : "");
  const [date, setDate] = useState("");
  const [start, setStart] = useState(""); // ISO
  const [startBarber, setStartBarber] = useState<string | null>(null); // when switching barber from a suggestion
  const [details, setDetails] = useState({ name: "", phone: "", email: "", message: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Alternatives | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const qualified = useMemo(() => barbers.filter((b) => b.service_ids.includes(serviceId)), [barbers, serviceId]);
  const barber = barbers.find((b) => b.id === barberId);
  const effectiveBarberId = startBarber ?? barberId;
  const finalBarber = barbers.find((b) => b.id === effectiveBarberId);

  // If the preselected barber doesn't do the chosen service, clear it.
  useEffect(() => {
    if (barberId && barberId !== "any" && serviceId && !qualified.some((b) => b.id === barberId)) setBarberId("");
  }, [barberId, serviceId, qualified]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const go = (n: number) => { setError(null); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  if (!props.onlineEnabled) {
    return (
      <div className="wrap max-w-xl py-16 text-center">
        <h1 className="display text-4xl">Online booking is paused</h1>
        <p className="mt-4 text-smoke">Please call us{props.shopPhone ? ` on ${props.shopPhone}` : ""} and we'll find you a time.</p>
      </div>
    );
  }

  const summary = (
    <dl className="space-y-3 text-sm">
      <Row label="Service" value={service ? `${service.name}, ${dur(service.duration_min)}` : "Not chosen"} onEdit={service ? () => go(0) : undefined} />
      <Row label="Barber" value={barberId === "any" && !startBarber ? "Any available barber" : finalBarber?.name ?? "Not chosen"} onEdit={barberId ? () => go(1) : undefined} />
      <Row label="When" value={start ? DateTime.fromISO(start).setZone(zone).toFormat("cccc d LLLL, HH:mm") : "Not chosen"} onEdit={start ? () => go(2) : undefined} />
      {service && (
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-semibold">Price</dt>
          <dd className="display text-2xl text-brass-dark">{money(service.price_pence, currency)}</dd>
        </div>
      )}
    </dl>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !start) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, barberId: effectiveBarberId, start, ...details }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(data.url);
        return;
      }
      setError(data.error ?? "That didn't work. Please try again.");
      if (res.status === 409 && data.alternatives) {
        setConflict(data.alternatives);
        setStart("");
        setStep(2);
      }
    } catch {
      setError("We couldn't reach the shop's booking system. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap py-8 sm:py-12">
      <ol className="mb-8 flex gap-1 sm:gap-2" aria-label="Booking steps">
        {STEPS.map((label, i) => {
          const done = i < step;
          const reachable = i <= step;
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && go(i)}
                aria-current={i === step ? "step" : undefined}
                className={`w-full border-t-2 pt-2 text-left text-xs sm:text-sm ${i === step ? "border-brass font-semibold text-ink" : done ? "border-ink text-ink" : "border-line text-smoke"}`}
              >
                <span className="tabular-nums">{i + 1}.</span> <span className={i === step ? "" : "hidden sm:inline"}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section aria-live="polite" className="min-w-0">
          {error && (
            <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
          )}

          {step === 0 && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="display text-3xl outline-none sm:text-4xl">What are you having done?</h1>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceId(s.id); setStart(""); setStartBarber(null);
                        const keepBarber = barberId === "any" || barbers.find((b) => b.id === barberId)?.service_ids.includes(s.id);
                        go(barberId && keepBarber ? 2 : 1);
                      }}
                      className={`flex w-full items-center gap-4 px-1 py-4 text-left hover:bg-mist ${s.id === serviceId ? "bg-mist" : ""}`}
                    >
                      <span className="flex-1">
                        <span className="block text-lg font-semibold">{s.name}</span>
                        <span className="block text-sm text-smoke">{dur(s.duration_min)}{s.description ? `. ${s.description}` : ""}</span>
                      </span>
                      <span className="display text-xl text-brass-dark">{money(s.price_pence, currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 1 && service && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="display text-3xl outline-none sm:text-4xl">Who would you like?</h1>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <BarberOption
                  selected={barberId === "any"}
                  onClick={() => { setBarberId("any"); setStart(""); setStartBarber(null); go(2); }}
                  title="Any available barber"
                  sub="Most choice of times. We'll match you with whoever is free."
                  face={<span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-brass-light" aria-hidden>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 19c.7-3 3.1-4.8 6-4.8s5.3 1.8 6 4.8M15 14.6c2.6 0 4.6 1.5 5.2 4"/></svg>
                  </span>}
                />
                {qualified.map((b) => (
                  <BarberOption
                    key={b.id}
                    selected={barberId === b.id}
                    onClick={() => { setBarberId(b.id); setStart(""); setStartBarber(null); go(2); }}
                    title={b.name}
                    sub={b.specialties || b.title}
                    face={<Face b={b} />}
                  />
                ))}
              </div>
              {qualified.length === 0 && <p className="mt-4 text-smoke">No barber offers this service right now. Please choose another service.</p>}
            </>
          )}

          {step === 2 && service && barberId && (
            <TimePicker
              key={`${serviceId}:${barberId}`}
              headingRef={headingRef}
              service={service}
              barberId={barberId}
              barbers={barbers}
              zone={zone}
              date={date}
              setDate={setDate}
              selected={start}
              selectedBarber={startBarber}
              conflict={conflict}
              onPick={(iso, switchTo) => {
                setStart(iso);
                setStartBarber(switchTo && switchTo !== barberId ? switchTo : null);
                if (switchTo && barberId !== "any") { setBarberId(switchTo); setStartBarber(null); }
                setConflict(null);
                go(3);
              }}
            />
          )}

          {step === 3 && service && start && (
            <form onSubmit={submit} noValidate={false}>
              <h1 ref={headingRef} tabIndex={-1} className="display text-3xl outline-none sm:text-4xl">Your details</h1>
              <p className="mt-2 text-smoke">We only use these to manage your appointment.</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" className="field" required autoComplete="name" maxLength={80} value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="phone">Mobile number</label>
                  <input id="phone" className="field" required type="tel" inputMode="tel" autoComplete="tel" placeholder="07700 900123" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
                  <p className="hint">So your barber can reach you if anything changes.</p>
                </div>
                <div>
                  <label className="label" htmlFor="email">Email <span className="font-normal text-smoke">(optional)</span></label>
                  <input id="email" className="field" type="email" autoComplete="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                  <p className="hint">For your confirmation and booking link.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="message">Anything your barber should know? <span className="font-normal text-smoke">(optional)</span></label>
                  <textarea id="message" className="field" rows={3} maxLength={500} value={details.message} onChange={(e) => setDetails({ ...details, message: e.target.value })} />
                </div>
                <div className="hidden" aria-hidden>
                  <label htmlFor="website">Website</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={details.website} onChange={(e) => setDetails({ ...details, website: e.target.value })} />
                </div>
              </div>
              <div className="mt-6 rounded-md bg-mist px-4 py-3 text-sm text-char">
                Your barber will approve the request, usually within a couple of hours. The time is held for you while you wait.
                {props.cancellationPolicy && <span className="mt-1 block text-smoke">{props.cancellationPolicy}</span>}
              </div>
              <div className="mt-6 lg:hidden">{summary}</div>
              <button type="submit" disabled={submitting || details.name.trim().length < 2 || details.phone.trim().length < 7} className="btn-gold mt-6 w-full py-3.5 text-base sm:w-auto sm:px-8">
                {submitting ? "Sending request…" : "Request booking"}
              </button>
            </form>
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border border-line p-5">
            <h2 className="display mb-4 text-xl">Your booking</h2>
            {summary}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <dt className="text-xs text-smoke">{label}</dt>
        <dd className="font-semibold">{value}</dd>
      </div>
      {onEdit && <button type="button" onClick={onEdit} className="text-xs font-semibold text-brass-dark underline underline-offset-2">Change</button>}
    </div>
  );
}

function BarberOption({ selected, onClick, title, sub, face }: { selected: boolean; onClick: () => void; title: string; sub: string; face: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:border-ink ${selected ? "border-ink bg-mist" : "border-line"}`}>
      {face}
      <span>
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block text-sm text-smoke">{sub}</span>}
      </span>
    </button>
  );
}

/* ------------------------------- time picker ------------------------------- */

function TimePicker(p: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  service: Service;
  barberId: string;
  barbers: Barber[];
  zone: string;
  date: string;
  setDate: (d: string) => void;
  selected: string;
  selectedBarber: string | null;
  conflict: Alternatives | null;
  onPick: (iso: string, barberId?: string) => void;
}) {
  const { service, barberId, zone } = p;
  const today = DateTime.now().setZone(zone).toISODate()!;
  const [from, setFrom] = useState(p.date && p.date >= today ? p.date : today);
  const [days, setDays] = useState<DayCount[] | null>(null);
  const [maxDate, setMaxDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotView[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [taken, setTaken] = useState<SlotView | null>(null);
  const [failed, setFailed] = useState(false);
  const name = (id: string) => p.barbers.find((b) => b.id === id)?.name ?? "";
  const barberName = barberId === "any" ? null : name(barberId);

  // Week strip of 14 days
  useEffect(() => {
    let off = false;
    setDays(null);
    fetch(`/api/availability/days?serviceId=${service.id}&barberId=${barberId}&from=${from}&days=14`)
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        setDays(d.days ?? []);
        setMaxDate(d.maxDate ?? null);
        if (!p.date || p.date < (d.days?.[0]?.date ?? "") || p.date > (d.days?.at(-1)?.date ?? "")) {
          const first = (d.days as DayCount[]).find((x) => x.count > 0);
          p.setDate(first?.date ?? d.days?.[0]?.date ?? from);
        }
      })
      .catch(() => !off && setFailed(true));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, barberId, from]);

  const loadSlots = useCallback(() => {
    if (!p.date) return;
    setLoadingSlots(true);
    setTaken(null);
    fetch(`/api/availability?serviceId=${service.id}&barberId=${barberId}&date=${p.date}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setFailed(true))
      .finally(() => setLoadingSlots(false));
  }, [p.date, service.id, barberId]);
  useEffect(loadSlots, [loadSlots]);

  const groups = useMemo(() => {
    const g: Record<string, SlotView[]> = { Morning: [], Afternoon: [], Evening: [] };
    for (const s of slots ?? []) {
      const h = Number(s.time.slice(0, 2));
      g[h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"].push(s);
    }
    return g;
  }, [slots]);

  const availableCount = (slots ?? []).filter((s) => s.available).length;
  const nextDay = days?.find((d) => d.date > p.date && d.count > 0);
  const otherBarbersToday = barberName ? [...new Set((slots ?? []).flatMap((s) => s.freeBarberIds))].filter((id) => id !== barberId) : [];

  const canBack = from > today;
  const canFwd = !maxDate || DateTime.fromISO(from).plus({ days: 14 }).toISODate()! <= maxDate;

  return (
    <>
      <h1 ref={p.headingRef} tabIndex={-1} className="display text-3xl outline-none sm:text-4xl">Pick a time</h1>
      <p className="mt-2 text-smoke">{service.name} ({dur(service.duration_min)}) with {barberName ?? "any available barber"}.</p>

      {p.conflict && (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">That time has just gone. Here's what's still free:</p>
          {p.conflict.otherBarbersAtTime.length > 0 && (
            <p className="mt-2">Free at the same time: {p.conflict.otherBarbersAtTime.map((b) => b.name).join(", ")}.</p>
          )}
          {p.conflict.sameBarberTimes[0] && (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.conflict.sameBarberTimes[0].slots.map((s) => (
                <button key={s.start} type="button" className="btn-line btn-sm" onClick={() => p.onPick(s.start)}>
                  {DateTime.fromISO(s.start).setZone(zone).toFormat("ccc d, HH:mm")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {failed && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">Times couldn't be loaded. Refresh the page to try again.</div>}

      {/* Date strip */}
      <div className="mt-6 flex items-center gap-2">
        <button type="button" disabled={!canBack} onClick={() => setFrom(DateTime.fromISO(from).minus({ days: 14 }).toISODate()! < today ? today : DateTime.fromISO(from).minus({ days: 14 }).toISODate()!)}
          className="rounded-md border border-line p-2 disabled:opacity-30" aria-label="Earlier dates">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m15 6-6 6 6 6"/></svg>
        </button>
        <div className="-mx-1 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Dates">
          {(days ?? Array.from({ length: 7 }, (_, i) => ({ date: `skeleton-${i}`, count: -1 }))).map((d) => {
            if (d.count < 0) return <div key={d.date} className="h-[4.75rem] w-16 shrink-0 animate-pulse rounded-md bg-mist" />;
            const dt = DateTime.fromISO(d.date, { zone });
            const sel = d.date === p.date;
            const full = d.count === 0;
            return (
              <button
                key={d.date}
                type="button"
                role="option"
                aria-selected={sel}
                aria-label={`${dt.toFormat("cccc d LLLL")}${full ? ", no times" : `, ${d.count} times`}`}
                onClick={() => p.setDate(d.date)}
                className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-md border py-2 ${sel ? "border-ink bg-ink text-white" : full ? "border-line text-smoke/60" : "border-line hover:border-ink"}`}
              >
                <span className="text-[11px]">{dt.toFormat("ccc")}</span>
                <span className="display text-xl leading-tight">{dt.toFormat("d")}</span>
                <span className={`text-[10px] ${sel ? "text-brass-light" : full ? "" : "text-brass-dark"}`}>{full ? "Full" : `${d.count} free`}</span>
              </button>
            );
          })}
        </div>
        <button type="button" disabled={!canFwd} onClick={() => setFrom(DateTime.fromISO(from).plus({ days: 14 }).toISODate()!)}
          className="rounded-md border border-line p-2 disabled:opacity-30" aria-label="Later dates">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </div>
      {p.date && <p className="mt-3 text-sm font-semibold">{DateTime.fromISO(p.date, { zone }).toFormat("cccc d LLLL")}</p>}

      {/* Slots */}
      <div className="mt-4 min-h-40">
        {loadingSlots && !slots ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-md bg-mist" />)}</div>
        ) : slots && (slots.length === 0 || availableCount === 0) && !otherBarbersToday.length ? (
          <div className="rounded-md border border-dashed border-line p-6 text-center">
            <p className="font-semibold">No times left on this day.</p>
            {nextDay && <button type="button" className="btn-dark mt-3" onClick={() => p.setDate(nextDay.date)}>Next free day: {DateTime.fromISO(nextDay.date, { zone }).toFormat("cccc d LLL")}</button>}
          </div>
        ) : (
          <div className={`space-y-5 transition-opacity ${loadingSlots ? "opacity-50" : ""}`}>
            {barberName && availableCount === 0 && (
              <div className="rounded-md border border-line bg-mist p-4 text-sm">
                <p className="font-semibold">{barberName} has no times left on this day.</p>
                {otherBarbersToday.length > 0 && <p className="mt-1">{otherBarbersToday.map(name).join(", ")} {otherBarbersToday.length === 1 ? "is" : "are"} free. The greyed-out times below show when.</p>}
                {nextDay && <button type="button" className="btn-line btn-sm mt-3" onClick={() => p.setDate(nextDay.date)}>{barberName.split(" ")[0]}'s next free day: {DateTime.fromISO(nextDay.date, { zone }).toFormat("ccc d LLL")}</button>}
              </div>
            )}
            {Object.entries(groups).map(([label, list]) => list.length > 0 && (
              <div key={label}>
                <h2 className="mb-2 text-sm font-semibold text-smoke">{label}</h2>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {list.map((s) => {
                    const sel = p.selected === s.start;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        onClick={() => (s.available ? p.onPick(s.start, barberId === "any" ? undefined : barberId) : setTaken(s))}
                        aria-label={s.available ? `${s.time}` : `${s.time}, ${barberName} is booked; other barbers free`}
                        className={`h-11 rounded-md border text-sm font-semibold tabular-nums transition-colors ${
                          sel ? "border-brass bg-brass text-ink"
                            : s.available ? "border-line hover:border-ink"
                            : "border-dashed border-line text-smoke/60 line-through decoration-smoke/40 hover:text-smoke"
                        }`}
                      >
                        {s.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chosen barber is busy at a time: offer the others */}
      {taken && barberName && (
        <div className="mt-6 rounded-lg border border-ink p-5" role="dialog" aria-label={`${taken.time} options`}>
          <p className="font-semibold">{barberName} is already booked at {taken.time}.</p>
          <p className="mt-1 text-sm text-smoke">These barbers are free at {taken.time}:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {taken.freeBarberIds.map((id) => (
              <button key={id} type="button" className="btn-dark btn-sm" onClick={() => p.onPick(taken.start, id)}>
                Book {name(id)} at {taken.time}
              </button>
            ))}
          </div>
          {(() => {
            const near = (slots ?? []).filter((s) => s.available)
              .sort((a, b) => Math.abs(+new Date(a.start) - +new Date(taken.start)) - Math.abs(+new Date(b.start) - +new Date(taken.start)))
              .slice(0, 4).sort((a, b) => a.start.localeCompare(b.start));
            return near.length > 0 && (
              <>
                <p className="mt-4 text-sm text-smoke">Or stay with {barberName.split(" ")[0]} at:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {near.map((s) => <button key={s.start} type="button" className="btn-line btn-sm" onClick={() => p.onPick(s.start, barberId)}>{s.time}</button>)}
                </div>
              </>
            );
          })()}
          <button type="button" className="mt-4 text-sm text-smoke underline" onClick={() => setTaken(null)}>Close</button>
        </div>
      )}
    </>
  );
}
