import Link from "next/link";
import { Avatar, StatusBadge } from "@/components/ui";
import { customerBooking } from "@/lib/customer-access";
import { emailConfigured } from "@/lib/notify";
import { formatDuration, formatMoney, getSettings } from "@/lib/settings";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { ManageForms } from "../forms";

export const metadata = { title: "Your booking", robots: { index: false } };

const EXPLAIN: Record<string, string> = {
  CONFIRMED: "You're booked in. See you then.",
  REJECTED: "The barber couldn't take this booking. Please choose another time.",
  CANCELLED: "This booking was cancelled.",
  COMPLETED: "Thanks for coming in.",
  NO_SHOW: "This appointment was marked as missed.",
  EXPIRED: "This request wasn't approved in time, so the slot was released. Please book another time.",
};

export default async function BookingPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ t?: string }> }) {
  const { ref } = await params;
  const { t = "" } = await searchParams;
  const a = await customerBooking(ref, t);
  if (!a) {
    return (
      <div className="wrap max-w-md py-16">
        <h1 className="display text-3xl">We need to check it's you</h1>
        <p className="mt-3 text-smoke">This link is incomplete or has expired. Find your booking with its reference and your mobile number.</p>
        <Link href="/booking" className="btn-dark mt-6">Find my booking</Link>
      </div>
    );
  }
  const s = await getSettings();
  const active = ["PENDING", "CONFIRMED"].includes(a.status);
  const canCancel = active && +new Date(a.start_at) - Date.now() > s.cancellation_cutoff_hours * 3_600_000;
  const emailOn = Boolean(a.email) && emailConfigured();

  return (
    <div className="wrap max-w-2xl py-10 sm:py-14">
      <p className="text-sm text-smoke">Booking reference</p>
      <p className="display text-3xl tracking-wide">{a.reference}</p>

      <div className="mt-6 rounded-lg border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <StatusBadge status={a.status} />
          {a.reschedule_requested && active && <span className="text-sm text-amber-800">Change requested, waiting for the shop</span>}
        </div>
        <div className="px-5 py-4 text-[15px]">
          {a.status === "PENDING" ? (
            <p>Waiting for {a.barber_name.split(" ")[0]} to approve. Your time is held until {fmtTime(a.expires_at, s.timezone)} on {fmtDateTime(a.expires_at, s.timezone).split(",")[0]}.</p>
          ) : <p>{EXPLAIN[a.status]}</p>}
          <p className="mt-2 text-sm text-smoke">
            {emailOn ? `We'll email ${a.email} when anything changes. ` : ""}Bookmark this page to check your status at any time.
          </p>
        </div>
        <dl className="grid gap-5 border-t border-line px-5 py-5 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <Avatar name={a.barber_name} photo={a.barber_photo} size={48} />
            <div><dt className="text-xs text-smoke">Barber</dt><dd className="font-semibold">{a.barber_name}</dd></div>
          </div>
          <div><dt className="text-xs text-smoke">When</dt><dd className="font-semibold">{fmtDateTime(a.start_at, s.timezone)}</dd></div>
          <div><dt className="text-xs text-smoke">Service</dt><dd className="font-semibold">{a.service_name}, {formatDuration(a.duration_min)}</dd></div>
          <div><dt className="text-xs text-smoke">Price</dt><dd className="font-semibold">{formatMoney(a.price_pence, s.currency)}</dd></div>
          <div><dt className="text-xs text-smoke">Where</dt><dd className="font-semibold">{s.address}</dd></div>
        </dl>
        {active && (
          <div className="border-t border-line px-5 py-4">
            <a className="text-sm font-semibold underline decoration-brass underline-offset-4" href={`/booking/${a.reference}/ics${t ? `?t=${encodeURIComponent(t)}` : ""}`}>Add to calendar</a>
          </div>
        )}
      </div>

      {active && (
        <div className="mt-8">
          <ManageForms reference={a.reference} token={t} canCancel={canCancel}
            cutoffNote={`Online cancellation closes ${s.cancellation_cutoff_hours} hours before your appointment. Please call ${s.phone || "the shop"}.`} />
        </div>
      )}
      {!active && <Link href="/book" className="btn-dark mt-8">Book again</Link>}
    </div>
  );
}
