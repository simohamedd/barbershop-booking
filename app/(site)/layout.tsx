import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { usesDefaultPhotos } from "@/lib/photos";
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
  const rows = hoursRows(hours);
  const wa = s.whatsapp_number.replace(/[^\d]/g, "");
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 text-white backdrop-blur-md">
        <div className="wrap flex h-[72px] items-center justify-between">
          <Wordmark name={s.shop_name} logo={s.logo_url} light caps />
          <nav aria-label="Main" className="hidden items-center gap-8 text-[15px] md:flex">
            {NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="text-white/70 transition-colors hover:text-white">{n.label}</Link>
            ))}
            <Link href="/book" className="btn-gold">Book an appointment</Link>
          </nav>
          <MobileNav items={[...NAV, { href: "/booking", label: "Find my booking" }]} />
        </div>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="bg-ink text-white/65">
        <div className="wrap grid gap-12 py-16 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Wordmark name={s.shop_name} logo={s.logo_url} light caps />
            {s.tagline && <p className="mt-5 max-w-xs leading-relaxed">{s.tagline}</p>}
            <Link href="/book" className="btn-gold mt-6">Book an appointment</Link>
          </div>
          <div>
            <h2 className="mb-4 font-display text-lg text-white">Opening hours</h2>
            {rows.length ? (
              <dl className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.days} className="flex justify-between gap-6 sm:max-w-[15rem]"><dt>{r.days}</dt><dd className="tabular-nums text-white">{r.hours}</dd></div>
                ))}
              </dl>
            ) : <p>Opening hours coming soon.</p>}
          </div>
          <div className="space-y-1.5">
            <h2 className="mb-4 font-display text-lg text-white">Visit</h2>
            {s.address ? <p className="max-w-[16rem] leading-relaxed">{s.address}</p> : !s.phone && !s.email && !wa && <p>Address coming soon.</p>}
            {s.maps_url && <p><a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="text-brass-light hover:text-white">Get directions</a></p>}
            {s.phone && <p className="pt-2"><a className="hover:text-white" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></p>}
            {s.email && <p><a className="hover:text-white" href={`mailto:${s.email}`}>{s.email}</a></p>}
            {wa && <p><a className="hover:text-white" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp us</a></p>}
          </div>
          <div className="space-y-1.5">
            <h2 className="mb-4 font-display text-lg text-white">Your booking</h2>
            <p><Link href="/booking" className="hover:text-white">Find, change or cancel a booking</Link></p>
            <p><Link href="/services" className="hover:text-white">Services and prices</Link></p>
            <p><Link href="/barbers" className="hover:text-white">Meet the barbers</Link></p>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="wrap flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/40">
            <p>© {new Date().getFullYear()} {s.shop_name}</p>
            <div className="flex gap-5">
              {usesDefaultPhotos(s.hero_image_url, s.gallery_urls) && <a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer" className="hover:text-white/70">Photos from Unsplash</a>}
              <Link href="/login" className="hover:text-white/70">Staff login</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
