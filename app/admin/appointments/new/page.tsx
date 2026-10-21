import { DateTime } from "luxon";
import { ManualBooking } from "@/components/dash/ManualBooking";
import { PageTitle } from "@/components/dash/Shell";
import { activeBarbers, activeServices } from "@/lib/dash-data";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Add appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ date?: string; time?: string; barber?: string }> }) {
  const sp = await searchParams;
  const [s, services, barbers] = await Promise.all([getSettings(), activeServices(), activeBarbers()]);
  return (
    <>
      <PageTitle title="Add appointment">For bookings that come in by WhatsApp, phone or walk-in. The same availability rules as online bookings apply.</PageTitle>
      <ManualBooking currency={s.currency} area="admin" isAdmin services={services} barbers={barbers} today={DateTime.now().setZone(s.timezone).toISODate()!}
        defaults={{ date: sp.date, time: sp.time, barberId: sp.barber }} />
    </>
  );
}
