/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { DateTime } from "luxon";
import { formatDuration, formatMoney } from "@/lib/settings";
import { hoursRows, type PublicBarber, type PublicService } from "@/lib/queries";
import { DEFAULT_HERO } from "@/lib/photos";

/** Small scissors ornament between two gold hairlines. */
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div className={`rule-gold ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.6 7.5 20 18M8.6 16.5 20 6" />
      </svg>
    </div>
  );
}

export function SectionTitle({ title, intro, dark = false, align = "center" }: { title: string; intro?: string; dark?: boolean; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      {align === "center" && <Ornament className="mx-auto mb-6 w-40" />}
      <h2 className={`display text-4xl sm:text-5xl ${dark ? "text-white" : ""}`}>{title}</h2>
      {intro && <p className={`mt-4 text-[17px] leading-relaxed ${dark ? "text-white/65" : "text-smoke"}`}>{intro}</p>}
    </div>
  );
}

/** The price menu: name, dotted leader, price — like the board on a barbershop wall. */
export function PriceBoard({ services, currency, dark = false, columns = 1 }: { services: PublicService[]; currency: string; dark?: boolean; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-x-16 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {services.map((s) => (
        <li key={s.id} className={`border-b ${dark ? "border-white/10" : "border-line"}`}>
          <Link href={`/book?service=${s.id}`} className="group block py-6">
            <div className="flex items-baseline gap-3">
              <span className={`display text-[22px] sm:text-2xl ${dark ? "text-white" : ""}`}>{s.name}</span>
              <span aria-hidden className={`leader ${dark ? "border-white/25" : "border-smoke/40"}`} />
              <span className={`display text-[22px] tabular-nums sm:text-2xl ${dark ? "text-brass-light" : "text-brass-dark"}`}>{formatMoney(s.price_pence, currency)}</span>
            </div>
            <div className={`mt-1.5 flex items-baseline justify-between gap-6 text-[15px] ${dark ? "text-white/55" : "text-smoke"}`}>
              <span>{formatDuration(s.duration_min)}{s.description ? `. ${s.description}` : ""}</span>
              <span className={`shrink-0 text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${dark ? "text-brass-light" : "text-brass-dark"}`}>Book</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/** Portrait frame: the barber's photo, or a gold monogram on black. */
export function Portrait({ name, photo, className = "" }: { name: string; photo?: string; className?: string }) {
  return (
    <div className={`relative aspect-[4/5] overflow-hidden bg-ink ${className}`}>
      {photo ? (
        <img src={photo} alt={`${name}`} className="photo" loading="lazy" />
      ) : (
        <div className="absolute inset-3 flex items-center justify-center border border-brass/40" aria-hidden>
          <span className="display text-5xl text-brass-light sm:text-6xl">{initials(name)}</span>
        </div>
      )}
    </div>
  );
}

export function nextFreeLabel(next: { date: string; time: string } | null | undefined, zone: string) {
  if (!next) return null;
  const d = DateTime.fromISO(next.date, { zone });
  const diff = Math.round(d.diff(DateTime.now().setZone(zone).startOf("day"), "days").days);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toFormat("cccc");
  return `${day} at ${next.time}`;
}

export function BarberCard({ b, services, next, showHours = false }: { b: PublicBarber; services: PublicService[]; next?: string | null; showHours?: boolean }) {
  const offered = services.filter((s) => b.service_ids.includes(s.id));
  const rows = hoursRows(b.hours);
  return (
    <article className="group flex flex-col">
      <Link href={`/book?barber=${b.id}`} className="block" tabIndex={-1} aria-hidden>
        <Portrait name={b.name} photo={b.photo} />
      </Link>
      <div className="flex flex-1 flex-col pt-5">
        <h3 className="display text-xl sm:text-2xl">{b.name}</h3>
        {b.title && <p className="mt-0.5 text-[15px] text-smoke">{b.title}</p>}
        {b.specialties && <p className="mt-3 text-[15px] text-brass-dark">{b.specialties}</p>}
        {showHours && b.bio && <p className="mt-3 text-[15px] leading-relaxed text-char">{b.bio}</p>}
        {showHours && rows.length > 0 && (
          <dl className="mt-4 space-y-0.5 text-sm">
            {rows.map((r) => (
              <div key={r.days} className="flex justify-between gap-4"><dt className="text-smoke">{r.days}</dt><dd className={`tabular-nums ${r.hours === "Closed" ? "text-smoke" : ""}`}>{r.hours === "Closed" ? "Off" : r.hours}</dd></div>
            ))}
          </dl>
        )}
        {showHours && offered.length > 0 && <p className="mt-4 text-xs leading-relaxed text-smoke">{offered.map((s) => s.name).join(", ")}</p>}
        <div className="mt-auto pt-5">
          {next !== undefined && (
            <p className="mb-3 flex items-center gap-2 text-sm">
              <span className={`h-1.5 w-1.5 rounded-full ${next ? "bg-emerald-500" : "bg-smoke/40"}`} aria-hidden />
              {next ? <span><span className="hidden sm:inline">Next free: </span><span className="font-medium">{next}</span></span> : <span className="text-smoke">Fully booked this week</span>}
            </p>
          )}
          <Link href={`/book?barber=${b.id}`} className="btn-dark w-full px-2">Book<span className="hidden sm:inline">&nbsp;with {b.name.split(" ")[0]}</span></Link>
        </div>
      </div>
    </article>
  );
}

/** Inner-page heading band over a darkened photo. */
export function PageHead({ title, children, image }: { title: string; children?: React.ReactNode; image?: string }) {
  return (
    <div className="relative overflow-hidden bg-ink text-white">
      <img src={image || DEFAULT_HERO} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/40" aria-hidden />
      <div className="wrap relative py-20 sm:py-28">
        <Ornament className="mb-6 w-24 !justify-start [&::before]:hidden" />
        <h1 className="display text-5xl sm:text-6xl">{title}</h1>
        {children && <div className="mt-5 max-w-prose text-[17px] leading-relaxed text-white/70">{children}</div>}
      </div>
    </div>
  );
}
