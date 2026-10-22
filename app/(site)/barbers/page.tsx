import { BarberCard, nextFreeLabel, PageHead } from "@/components/site";
import { galleryImages } from "@/lib/photos";
import { getSettings } from "@/lib/settings";
import { nextFreeByBarber, publicBarbers, publicServices } from "@/lib/queries";

export const metadata = { title: "Our barbers" };

export default async function BarbersPage() {
  const s = await getSettings();
  const [barbers, services, board] = await Promise.all([publicBarbers(), publicServices(), nextFreeByBarber(s)]);
  const next = new Map(board.map((b) => [b.id, nextFreeLabel(b.next, s.timezone)]));
  return (
    <>
      <PageHead title="Our barbers" image={galleryImages(s.gallery_urls)[3]?.src}>
        Every barber keeps their own diary. Pick someone you like, or let us match you with whoever is free.
      </PageHead>
      <div className="wrap py-16 sm:py-20">
        {barbers.length ? (
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {barbers.map((b) => <BarberCard key={b.id} b={b} services={services} next={next.get(b.id) ?? null} showHours />)}
          </div>
        ) : <p className="text-smoke">Our team will be introduced here soon.</p>}
      </div>
    </>
  );
}
