import Link from "next/link";
import { PageHead } from "@/components/site";
import { galleryImages } from "@/lib/photos";
import { getSettings } from "@/lib/settings";
import { hoursRows, shopHours } from "@/lib/queries";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const [s, hours] = await Promise.all([getSettings(), shopHours()]);
  const wa = s.whatsapp_number.replace(/[^\d]/g, "");
  const rows = hoursRows(hours);
  return (
    <>
      <PageHead title="Contact" image={galleryImages(s.gallery_urls)[4]?.src}>{s.about || "Questions, group bookings or anything else, get in touch."}</PageHead>
      <div className="wrap grid gap-14 py-16 sm:py-20 md:grid-cols-2">
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-xl">Address</h2>
            <p className="mt-2 text-lg">{s.address || "Address coming soon."}</p>
            {s.maps_url && <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium underline decoration-brass decoration-2 underline-offset-4">Get directions</a>}
          </div>
          {s.phone && <div><h2 className="font-display text-xl">Phone</h2><a className="mt-2 block text-lg" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></div>}
          {wa && <div><h2 className="font-display text-xl">WhatsApp</h2><a className="mt-2 block text-lg underline decoration-brass decoration-2 underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}`}>{s.whatsapp_number}</a><p className="hint">We can book you in by message too.</p></div>}
          {s.email && <div><h2 className="font-display text-xl">Email</h2><a className="mt-2 block text-lg" href={`mailto:${s.email}`}>{s.email}</a></div>}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/book" className="btn-dark btn-lg">Book an appointment</Link>
            <Link href="/booking" className="btn-line btn-lg">Find my booking</Link>
          </div>
        </div>
        <div className="bg-ivory p-8">
          <h2 className="font-display text-xl">Opening hours</h2>
          {rows.length ? (
            <dl className="mt-5 space-y-3">
              {rows.map((r) => (
                <div key={r.days} className="flex justify-between border-b border-line pb-3"><dt>{r.days}</dt><dd className="tabular-nums">{r.hours}</dd></div>
              ))}
            </dl>
          ) : <p className="mt-3 text-smoke">Opening hours coming soon.</p>}
        </div>
      </div>
    </>
  );
}
