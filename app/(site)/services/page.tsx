import Link from "next/link";
import { PageHead, PriceBoard } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { publicServices } from "@/lib/queries";

export const metadata = { title: "Services & prices" };

export default async function ServicesPage() {
  const [s, services] = await Promise.all([getSettings(), publicServices()]);
  return (
    <>
      <PageHead title="Services & prices">Choose a service to see who can do it and when they're free.</PageHead>
      <div className="wrap max-w-3xl py-12">
        <PriceBoard services={services} currency={s.currency} />
        {s.cancellation_policy && (
          <div className="mt-12 border-l-2 border-brass pl-5 text-sm text-smoke">
            <p className="font-semibold text-ink">Cancellations</p>
            <p className="mt-1">{s.cancellation_policy}</p>
          </div>
        )}
        <Link href="/book" className="btn-dark mt-10">Book an appointment</Link>
      </div>
    </>
  );
}
