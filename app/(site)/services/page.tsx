import Link from "next/link";
import { PageHead, PriceBoard } from "@/components/site";
import { galleryImages, heroImage } from "@/lib/photos";
import { getSettings } from "@/lib/settings";
import { publicServices } from "@/lib/queries";

export const metadata = { title: "Services & prices" };

export default async function ServicesPage() {
  const [s, services] = await Promise.all([getSettings(), publicServices()]);
  return (
    <>
      <PageHead title="Services & prices" image={galleryImages(s.gallery_urls)[2]?.src ?? heroImage(s.hero_image_url)}>
        Choose a service to see which barbers do it and when they&apos;re free.
      </PageHead>
      <div className="wrap max-w-4xl py-16 sm:py-20">
        {services.length ? <PriceBoard services={services} currency={s.currency} /> : <p className="text-smoke">Services and prices are coming soon.</p>}
        <div className="mt-14 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
          {s.cancellation_policy ? (
            <div className="border-l-2 border-brass pl-5">
              <p className="font-display text-lg">Cancellations</p>
              <p className="mt-1 leading-relaxed text-smoke">{s.cancellation_policy}</p>
            </div>
          ) : <span />}
          <Link href="/book" className="btn-dark btn-lg">Book an appointment</Link>
        </div>
      </div>
    </>
  );
}
