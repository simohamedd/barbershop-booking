/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Avatar } from "./ui";
import { formatDuration, formatMoney } from "@/lib/settings";
import { hoursRows, type PublicBarber, type PublicService } from "@/lib/queries";

/** Services as a shop price board: name, dotted leader, price; duration and description beneath. */
export function PriceBoard({ services, currency, dark = false }: { services: PublicService[]; currency: string; dark?: boolean }) {
  return (
    <ul className={`divide-y ${dark ? "divide-white/10" : "divide-line"}`}>
      {services.map((s) => (
        <li key={s.id} className="group py-5">
          <Link href={`/book?service=${s.id}`} className="block">
            <div className="flex items-baseline gap-3">
              <span className={`display text-xl sm:text-2xl ${dark ? "text-white" : ""}`}>{s.name}</span>
              <span aria-hidden className={`mb-1.5 flex-1 border-b border-dotted ${dark ? "border-white/25" : "border-smoke/40"}`} />
              <span className={`display text-xl tabular-nums sm:text-2xl ${dark ? "text-brass-light" : "text-brass-dark"}`}>{formatMoney(s.price_pence, currency)}</span>
            </div>
            <div className={`mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm ${dark ? "text-white/60" : "text-smoke"}`}>
              <span>{formatDuration(s.duration_min)}{s.description ? `. ${s.description}` : ""}</span>
              <span className={`font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${dark ? "text-brass-light" : "text-ink"}`}>Book this</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BarberCard({ b, services }: { b: PublicBarber; services: PublicService[] }) {
  const offered = services.filter((s) => b.service_ids.includes(s.id));
  return (
    <article className="flex flex-col border-t-2 border-ink pt-5">
      <div className="flex items-center gap-4">
        <Avatar name={b.name} photo={b.photo} size={72} />
        <div>
          <h3 className="display text-2xl leading-tight">{b.name}</h3>
          {b.title && <p className="text-sm text-smoke">{b.title}</p>}
        </div>
      </div>
      {b.specialties && <p className="mt-4 text-sm font-semibold text-brass-dark">{b.specialties}</p>}
      {b.bio && <p className="mt-2 text-[15px] leading-relaxed text-char">{b.bio}</p>}
      <dl className="mt-4 space-y-0.5 text-sm">
        {hoursRows(b.hours).map((r) => (
          <div key={r.days} className="flex justify-between gap-4"><dt className="text-smoke">{r.days}</dt><dd className={r.hours === "Closed" ? "text-smoke" : ""}>{r.hours === "Closed" ? "Off" : r.hours}</dd></div>
        ))}
      </dl>
      {offered.length > 0 && <p className="mt-4 text-xs text-smoke">{offered.map((s) => s.name).join(", ")}</p>}
      <div className="mt-auto pt-5">
        <Link href={`/book?barber=${b.id}`} className="btn-dark w-full">Book with {b.name.split(" ")[0]}</Link>
      </div>
    </article>
  );
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-ink text-white">
      <div className="wrap py-14 sm:py-20">
        <h1 className="display text-4xl sm:text-6xl">{title}</h1>
        {children && <div className="mt-4 max-w-prose text-white/70">{children}</div>}
      </div>
    </div>
  );
}
