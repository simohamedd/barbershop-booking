import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { hoursRows, shopHours } from "@/lib/queries";
import { MobileNav } from "./MobileNav";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/barbers", label: "Our barbers" },
  { href: "/contact", label: "Contact" },
];

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, hours] = await Promise.all([getSettings(), shopHours()]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-white">
        <div className="wrap flex h-16 items-center justify-between">
          <Wordmark name={s.shop_name} logo={s.logo_url} light />
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm md:flex">
            {NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="text-white/75 hover:text-white">{n.label}</Link>
            ))}
            <Link href="/book" className="btn-gold">Book an appointment</Link>
          </nav>
          <MobileNav items={[...NAV, { href: "/booking", label: "Find my booking" }]} />
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="bg-ink text-white/70">
        <div className="wrap grid gap-10 py-14 text-sm sm:grid-cols-3">
          <div>
            <Wordmark name={s.shop_name} logo={s.logo_url} light />
            <p className="mt-4 max-w-xs">{s.tagline}</p>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Opening hours</p>
            <dl className="space-y-1">
              {hoursRows(hours).map((r) => (
                <div key={r.days} className="flex justify-between gap-6 sm:max-w-[16rem]"><dt>{r.days}</dt><dd className="text-white">{r.hours}</dd></div>
              ))}
            </dl>
          </div>
          <div className="space-y-1">
            <p className="mb-3 font-semibold text-white">Visit</p>
            <p>{s.address}</p>
            {s.phone && <p><a className="hover:text-brass-light" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></p>}
            {s.email && <p><a className="hover:text-brass-light" href={`mailto:${s.email}`}>{s.email}</a></p>}
            <p className="pt-3"><Link href="/booking" className="underline decoration-brass underline-offset-4 hover:text-white">Find or cancel my booking</Link></p>
            <p><Link href="/login" className="text-white/40 hover:text-white">Staff login</Link></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
