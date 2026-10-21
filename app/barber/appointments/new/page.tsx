import { DateTime } from "luxon";
import { ManualBooking } from "@/components/dash/ManualBooking";
import { PageTitle } from "@/components/dash/Shell";
import { requireBarber } from "@/lib/auth";
import { activeServices } from "@/lib/dash-data";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Add booking" };

export default async function NewBarberBooking({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requireBarber();
  const sp = await searchParams;
  const s = await getSettings();
  const mine = await q<{ service_id: string }>(`SELECT service_id FROM barber_services WHERE barber_id = $1`, [u.barber_id]);
  const services = (await activeServices()).filter((x) => mine.some((m) => m.service_id === x.id));
  return (
    <>
      <PageTitle title="Add booking">For walk-ins or customers who message you directly. It goes straight into your diary.</PageTitle>
      <ManualBooking currency={s.currency} area="barber" isAdmin={false} services={services} fixedBarberId={u.barber_id}
        barbers={[{ id: u.barber_id, name: u.name, service_ids: services.map((x) => x.id) }]}
        today={DateTime.now().setZone(s.timezone).toISODate()!} defaults={{ date: sp.date }} />
    </>
  );
}
