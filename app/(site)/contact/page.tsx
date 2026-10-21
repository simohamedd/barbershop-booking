import Link from "next/link";
import { PageHead } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { hoursRows, shopHours } from "@/lib/queries";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const [s, hours] = await Promise.all([getSettings(), shopHours()]);
  const wa = s.whatsapp_number.replace(/[^\d]/g, "");
  return (
    <>
      <PageHead title="Contact">{s.about}</PageHead>
      <div className="wrap grid gap-12 py-14 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h2 className="font-semibold">Address</h2>
            <p className="mt-1 text-lg">{s.address}</p>
            {s.maps_url && <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline decoration-brass underline-offset-4">Open in Maps</a>}
          </div>
          {s.phone && <div><h2 className="font-semibold">Phone</h2><a className="mt-1 block text-lg" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></div>}
          {wa && <div><h2 className="font-semibold">WhatsApp</h2><a className="mt-1 block text-lg underline decoration-brass underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}`}>{s.whatsapp_number}</a><p className="hint">We can book you in by message too.</p></div>}
          {s.email && <div><h2 className="font-semibold">Email</h2><a className="mt-1 block text-lg" href={`mailto:${s.email}`}>{s.email}</a></div>}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/book" className="btn-dark">Book an appointment</Link>
            <Link href="/booking" className="btn-line">Find my booking</Link>
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Opening hours</h2>
          <dl className="mt-3 space-y-2">
            {hoursRows(hours).map((r) => (
              <div key={r.days} className="flex justify-between border-b border-line pb-2"><dt>{r.days}</dt><dd className="tabular-nums">{r.hours}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}
