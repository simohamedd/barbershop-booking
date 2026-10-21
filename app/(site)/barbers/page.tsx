import { BarberCard, PageHead } from "@/components/site";
import { publicBarbers, publicServices } from "@/lib/queries";

export const metadata = { title: "Our barbers" };

export default async function BarbersPage() {
  const [barbers, services] = await Promise.all([publicBarbers(), publicServices()]);
  return (
    <>
      <PageHead title="Our barbers">Every barber keeps their own diary. Pick someone you like, or let us match you with whoever is free.</PageHead>
      <div className="wrap grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {barbers.map((b) => <BarberCard key={b.id} b={b} services={services} />)}
      </div>
    </>
  );
}
