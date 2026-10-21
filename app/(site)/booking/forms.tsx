"use client";
import { useActionState, useState } from "react";
import { askToReschedule, cancelBooking, findBooking, type FormState } from "./actions";

function Msg({ s }: { s: FormState }) {
  if (!s) return null;
  if (s.error) return <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{s.error}</p>;
  return <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{s.ok}</p>;
}

export function LookupForm() {
  const [state, action, pending] = useActionState(findBooking, null);
  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="ref">Booking reference</label>
        <input id="ref" name="ref" className="field uppercase tracking-wide" placeholder="BK-7KQ3MP" required autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Mobile number</label>
        <input id="phone" name="phone" type="tel" className="field" required autoComplete="tel" />
      </div>
      <button className="btn-dark w-full" disabled={pending}>{pending ? "Checking…" : "Find booking"}</button>
      <Msg s={state} />
    </form>
  );
}

export function ManageForms({ reference, token, canCancel, cutoffNote }: { reference: string; token: string; canCancel: boolean; cutoffNote: string }) {
  const [cState, cancel, cPending] = useActionState(cancelBooking, null);
  const [rState, resched, rPending] = useActionState(askToReschedule, null);
  const [mode, setMode] = useState<"none" | "cancel" | "change">("none");
  if (cState?.ok) return <Msg s={cState} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-line" onClick={() => setMode(mode === "change" ? "none" : "change")} aria-expanded={mode === "change"}>Ask for a different time</button>
        {canCancel && <button type="button" className="btn-danger" onClick={() => setMode(mode === "cancel" ? "none" : "cancel")} aria-expanded={mode === "cancel"}>Cancel booking</button>}
      </div>
      {!canCancel && <p className="text-sm text-smoke">{cutoffNote}</p>}
      {mode === "change" && (
        <form action={resched} className="rounded-lg border border-line p-4">
          <input type="hidden" name="ref" value={reference} /><input type="hidden" name="t" value={token} />
          <label className="label" htmlFor="note">Which days or times suit you?</label>
          <textarea id="note" name="note" rows={3} className="field" maxLength={500} required placeholder="e.g. Any weekday after 5pm" />
          <button className="btn-dark mt-3" disabled={rPending}>{rPending ? "Sending…" : "Send request"}</button>
          <Msg s={rState} />
        </form>
      )}
      {mode === "cancel" && (
        <form action={cancel} className="rounded-lg border border-red-200 p-4">
          <input type="hidden" name="ref" value={reference} /><input type="hidden" name="t" value={token} />
          <p className="font-semibold">Cancel this booking?</p>
          <p className="text-sm text-smoke">The time will be released for other customers.</p>
          <label className="label mt-3" htmlFor="reason">Reason <span className="font-normal text-smoke">(optional)</span></label>
          <input id="reason" name="reason" className="field" maxLength={300} />
          <button className="btn-danger mt-3" disabled={cPending}>{cPending ? "Cancelling…" : "Yes, cancel booking"}</button>
          <Msg s={cState} />
        </form>
      )}
    </div>
  );
}
