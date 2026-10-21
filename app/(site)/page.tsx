/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { DateTime } from "luxon";
import { Avatar } from "@/components/ui";
import { BarberCard, PriceBoard } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { hoursRows, nextFreeByBarber, openNow, publicBarbers, publicServices, shopHours } from "@/lib/queries";

function whenLabel(dateISO: string, time: string, zone: string) {
  const d = DateTime.fromISO(dateISO, { zone });
  const today = DateTime.now().setZone(zone).startOf("day");
  const diff = Math.round(d.diff(today, "days").days);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  return `${d.toFormat("ccc d")}, ${time}`;
}

export default async function Home() {
  const s = await getSettings();
  const [services, barbers, hours, board] = await Promise.all([publicServices(), publicBarbers(), shopHours(), nextFreeByBarber(s)]);
  const status = openNow(hours, s.timezone);
  const photos = new Map(barbers.map((b) => [b.id, b.photo]));

  return (
    <>
      {/* Hero: the shop name as signage, with the live chair board beside it */}
      <section className="relative overflow-hidden bg-ink text-white">
        {s.hero_image_url && (
          <img src={s.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/30" aria-hidden />
        <div className="wrap relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/70">
              <span className={`h-2 w-2 rounded-full ${status.open ? "bg-emerald-400" : "bg-white/40"}`} aria-hidden />
              {status.label}
            </p>
            <h1 className="display mt-5 text-[clamp(3rem,9vw,6.5rem)] leading-[0.95]">{s.shop_name}</h1>
            <p className="mt-6 max-w-md text-lg text-white/80">{s.tagline}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/book" className="btn-gold px-6 py-3 text-base">Book an appointment</Link>
              <Link href="/services" className="btn-line-dark px-6 py-3 text-base">See prices</Link>
            </div>
          </div>

          <div className="rounded-lg border border-white/15 bg-char/90 backdrop-blur">
            <div className="flex items-baseline justify-between border-b border-white/10 px-5 py-4">
              <h2 className="display text-xl">Next free chair</h2>
              <span className="text-xs text-white/50">Live from the booking diary</span>
            </div>
            <ul className="divide-y divide-white/10">
              {board.map((b) => (
                <li key={b.id}>
                  <Link href={`/book?barber=${b.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/5">
                    <Avatar name={b.name} photo={photos.get(b.id)} size={40} dark />
                    <span className="flex-1 font-semibold">{b.name}</span>
                    <span className={`text-sm tabular-nums ${b.next ? "text-brass-light" : "text-white/40"}`}>
                      {b.next ? whenLabel(b.next.date, b.next.time, s.timezone) : "Fully booked this week"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Price board */}
      <section className="wrap grid gap-10 py-20 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="display text-4xl">Services & prices</h2>
          <p className="mt-4 max-w-sm text-smoke">Prices are per person. Times include a proper finish, so nobody is rushed out of the chair.</p>
          <Link href="/book" className="btn-dark mt-6">Choose a service</Link>
        </div>
        <PriceBoard services={services} currency={s.currency} />
      </section>

      {/* Barbers */}
      <section className="bg-mist py-20">
        <div className="wrap">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-4xl">Our barbers</h2>
            <Link href="/barbers" className="text-sm font-semibold underline decoration-brass underline-offset-4">Full profiles and hours</Link>
          </div>
          <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {barbers.map((b) => <BarberCard key={b.id} b={b} services={services} />)}
          </div>
        </div>
      </section>

      {/* Visit */}
      <section className="wrap grid gap-10 py-20 md:grid-cols-3">
        <div className="md:col-span-1">
          <h2 className="display text-4xl">Find us</h2>
          <p className="mt-4 text-smoke">{s.about}</p>
        </div>
        <div>
          <h3 className="font-semibold">Address</h3>
          <p className="mt-2">{s.address}</p>
          {s.maps_url && <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold underline decoration-brass underline-offset-4">Open in Maps</a>}
          <h3 className="mt-6 font-semibold">Get in touch</h3>
          <p className="mt-2">{s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>}</p>
          {s.whatsapp_number && (
            <p><a href={`https://wa.me/${s.whatsapp_number.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="underline decoration-brass underline-offset-4">Message us on WhatsApp</a></p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Opening hours</h3>
          <dl className="mt-2 space-y-1">
            {hoursRows(hours).map((r) => (
              <div key={r.days} className="flex justify-between gap-6 border-b border-line pb-1"><dt>{r.days}</dt><dd className="tabular-nums">{r.hours}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
