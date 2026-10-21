import { BookingWizard } from "@/components/booking/BookingWizard";
import { getSettings } from "@/lib/settings";
import { publicBarbers, publicServices } from "@/lib/queries";

export const metadata = { title: "Book an appointment" };

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; barber?: string }> }) {
  const sp = await searchParams;
  const [s, services, barbers] = await Promise.all([getSettings(), publicServices(), publicBarbers()]);
  return (
    <BookingWizard
      services={services}
      barbers={barbers.map((b) => ({ id: b.id, name: b.name, title: b.title, photo: b.photo, specialties: b.specialties, service_ids: b.service_ids }))}
      currency={s.currency}
      timezone={s.timezone}
      shopPhone={s.phone}
      cancellationPolicy={s.cancellation_policy}
      initialServiceId={sp.service}
      initialBarberId={sp.barber}
      onlineEnabled={s.allow_online_booking}
    />
  );
}
