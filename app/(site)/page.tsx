/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { BarberCard, nextFreeLabel, PriceBoard, SectionTitle } from "@/components/site";
import { DEFAULT_VISIT, galleryImages, heroImage } from "@/lib/photos";
import { formatMoney, getSettings } from "@/lib/settings";
import { hoursRows, nextFreeByBarber, openNow, publicBarbers, publicServices, shopHours, todaysHours } from "@/lib/queries";

export default async function Home() {
  const s = await getSettings();
  const [services, barbers, hours, board] = await Promise.all([publicServices(), publicBarbers(), shopHours(), nextFreeByBarber(s)]);
  const status = hours.length ? openNow(hours, s.timezone) : null;
  const nextById = new Map(board.map((b) => [b.id, nextFreeLabel(b.next, s.timezone)]));
  const gallery = galleryImages(s.gallery_urls);
  const today = todaysHours(hours, s.timezone);
  const minPrice = services.length ? Math.min(...services.map((x) => x.price_pence)) : null;
  const rows = hoursRows(hours);

  // Real facts only, drawn from the shop's own data.
  const facts = [
    s.established_year ? { big: String(s.established_year), label: "Established" } : null,
    barbers.length ? { big: String(barbers.length), label: barbers.length === 1 ? "Barber" : "Barbers on the team" } : null,
    minPrice !== null ? { big: formatMoney(minPrice, s.currency), label: "Services from" } : null,
    hours.length ? { big: today ?? "Closed", label: "Open today" } : null,
    { big: "24/7", label: "Online booking" },
  ].filter(Boolean).slice(0, 4) as { big: string; label: string }[];

  const headline = s.tagline || "Sharp cuts. Proper shaves.";

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-[72px] flex min-h-[640px] items-end overflow-hidden bg-ink pt-[72px] text-white sm:min-h-[88vh]">
        <img src={heroImage(s.hero_image_url)} alt="" className="absolute inset-0 h-full w-full object-cover grayscale" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/30" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/20 to-transparent" aria-hidden />
        <div className="wrap relative pb-16 sm:pb-24">
          {status && (
            <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-ink/40 px-4 py-1.5 text-sm text-white/85 backdrop-blur">
              <span className={`h-2 w-2 rounded-full ${status.open ? "bg-emerald-400" : "bg-white/40"}`} aria-hidden />
              {status.label}
            </p>
          )}
          <h1 className="display max-w-4xl text-[clamp(2.75rem,7.5vw,6rem)] leading-[1.02]">{headline}</h1>
          {s.about && <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{s.about}</p>}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/book" className="btn-gold btn-lg">Book an appointment</Link>
            <Link href="/services" className="btn-line-dark btn-lg">View prices</Link>
          </div>
        </div>
      </section>

      {/* Fact strip (only once there's enough real data to fill it) */}
      {facts.length >= 3 && <section className="border-y border-brass/25 bg-ink text-white">
        <dl className={`wrap grid grid-cols-2 ${facts.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
          {facts.map((f, i) => (
            <div key={f.label} className={`px-2 py-8 text-center ${i % 2 ? "border-l border-white/10" : ""} ${i > 0 ? "md:border-l md:border-white/10" : ""} ${i > 1 ? "border-t border-white/10 md:border-t-0" : ""}`}>
              <dt className="sr-only">{f.label}</dt>
              <dd>
                <span className="display block text-3xl tabular-nums text-brass-light sm:text-4xl">{f.big}</span>
                <span className="mt-1 block text-sm text-white/55">{f.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>}

      {/* The menu */}
      <section className="bg-char py-24 text-white sm:py-28">
        <div className="wrap">
          <SectionTitle dark title="The menu" intro="Every service includes a consultation and a proper finish. Prices are per person." />
          <div className="mx-auto mt-14 max-w-5xl">
            {services.length ? (
              <PriceBoard services={services} currency={s.currency} dark columns={2} />
            ) : <p className="text-center text-white/55">Services and prices are coming soon.</p>}
          </div>
          <div className="mt-12 text-center"><Link href="/book" className="btn-gold btn-lg">Book your service</Link></div>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-24 sm:py-28">
        <div className="wrap">
          <SectionTitle title="Inside the shop" intro="Clean lines, sharp tools and an unhurried chair." />
          <div className="mt-14 grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] md:grid-cols-4">
            {gallery.slice(0, 5).map((g, i) => (
              <figure key={g.src} className={`group overflow-hidden bg-ink ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                <img src={g.src} alt={g.alt} loading="lazy" className="photo" />
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Barbers */}
      {barbers.length > 0 && (
        <section className="bg-ivory py-24 sm:py-28">
          <div className="wrap">
            <SectionTitle title="Meet the barbers" intro="Pick someone you trust, or choose any available barber when you book." />
            <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 lg:grid-cols-4">
              {barbers.map((b) => <BarberCard key={b.id} b={b} services={services} next={nextById.get(b.id) ?? null} />)}
            </div>
            <p className="mt-12 text-center"><Link href="/barbers" className="font-medium underline decoration-brass decoration-2 underline-offset-[6px]">Full profiles and working hours</Link></p>
          </div>
        </section>
      )}

      {/* How booking works */}
      <section className="py-24 sm:py-28">
        <div className="wrap">
          <SectionTitle title="Booking takes a minute" />
          <ol className="mx-auto mt-14 grid max-w-5xl gap-10 md:grid-cols-3">
            {[
              ["Choose your service", "Pick from the menu. Prices and times are shown up front."],
              ["Pick a barber and a time", "See live availability for each barber, or let us match you with whoever is free."],
              ["Get confirmed", "Your barber approves the request and the time is held for you meanwhile. You'll get a link to check, change or cancel."],
            ].map(([t, d], i) => (
              <li key={t} className="border-t border-ink pt-6">
                <span className="display text-5xl text-brass" aria-hidden>{i + 1}</span>
                <h3 className="mt-3 text-xl font-medium">{t}</h3>
                <p className="mt-2 leading-relaxed text-smoke">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 text-center"><Link href="/book" className="btn-dark btn-lg">Start booking</Link></div>
        </div>
      </section>

      {/* Visit */}
      <section className="grid bg-ink text-white lg:grid-cols-2">
        <div className="group relative min-h-[320px] overflow-hidden">
          <img src={gallery[4]?.src ?? DEFAULT_VISIT} alt="" loading="lazy" className="photo absolute inset-0" />
        </div>
        <div className="px-6 py-20 sm:px-12 lg:px-16 lg:py-24">
          <h2 className="display text-4xl sm:text-5xl">Visit us</h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-lg text-brass-light">Address</h3>
              <p className="mt-3 leading-relaxed text-white/80">{s.address || "Address coming soon."}</p>
              {s.maps_url && <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium underline decoration-brass underline-offset-4">Get directions</a>}
              {(s.phone || s.whatsapp_number) && (
                <>
                  <h3 className="mt-8 font-display text-lg text-brass-light">Get in touch</h3>
                  {s.phone && <p className="mt-3"><a className="text-white/80 hover:text-white" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></p>}
                  {s.whatsapp_number && <p className="mt-1"><a className="text-white/80 hover:text-white" href={`https://wa.me/${s.whatsapp_number.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a></p>}
                </>
              )}
            </div>
            <div>
              <h3 className="font-display text-lg text-brass-light">Opening hours</h3>
              {rows.length ? (
                <dl className="mt-3 space-y-2">
                  {rows.map((r) => (
                    <div key={r.days} className="flex justify-between gap-6 border-b border-white/10 pb-2"><dt className="text-white/70">{r.days}</dt><dd className="tabular-nums">{r.hours}</dd></div>
                  ))}
                </dl>
              ) : <p className="mt-3 text-white/70">Opening hours coming soon.</p>}
            </div>
          </div>
          <Link href="/book" className="btn-gold btn-lg mt-12">Book an appointment</Link>
        </div>
      </section>
    </>
  );
}
