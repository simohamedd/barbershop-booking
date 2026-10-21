import Link from "next/link";
import { DateTime } from "luxon";
import { Calendar, type CalView } from "@/components/dash/Calendar";
import { PageTitle } from "@/components/dash/Shell";
import { Flash } from "@/components/ui";
import { activeBarbers } from "@/lib/dash-data";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Calendar" };

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; barber?: string; created?: string }> }) {
  const sp = await searchParams;
  const [s, barbers] = await Promise.all([getSettings(), activeBarbers()]);
  const view: CalView = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const date = sp.date && DateTime.fromISO(sp.date).isValid ? sp.date : DateTime.now().setZone(s.timezone).toISODate()!;
  let barberId = barbers.some((b) => b.id === sp.barber) ? sp.barber! : null;
  if (view === "week" && !barberId) barberId = barbers[0]?.id ?? null;
  return (
    <>
      <PageTitle title="Calendar" actions={<Link href={`/admin/appointments/new?date=${date}`} className="btn-gold">Add appointment</Link>}>
        Every barber's diary. Pending requests hold their slot until approved, rejected or expired.
      </PageTitle>
      {sp.created && <div className="mb-4"><Flash>Appointment saved and added to the calendar. <Link className="font-semibold underline" href={`/admin/appointments/${sp.created}`}>View it</Link></Flash></div>}
      <Calendar settings={s} view={view} date={date} barbers={barbers} focusBarberId={barberId} basePath="/admin/calendar" apptPath="/admin/appointments" allowAll />
    </>
  );
}
