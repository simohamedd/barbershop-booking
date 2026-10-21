import Link from "next/link";
import { DateTime } from "luxon";
import { Calendar, type CalView } from "@/components/dash/Calendar";
import { PageTitle } from "@/components/dash/Shell";
import { Flash } from "@/components/ui";
import { requireBarber } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "My calendar" };

export default async function BarberCalendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; created?: string }> }) {
  const u = await requireBarber();
  const sp = await searchParams;
  const s = await getSettings();
  const view: CalView = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const date = sp.date && DateTime.fromISO(sp.date).isValid ? sp.date : DateTime.now().setZone(s.timezone).toISODate()!;
  return (
    <>
      <PageTitle title="My calendar" actions={<Link href={`/barber/appointments/new?date=${date}`} className="btn-gold">Add booking</Link>} />
      {sp.created && <div className="mb-4"><Flash>Booking saved. <Link className="font-semibold underline" href={`/barber/appointments/${sp.created}`}>View it</Link></Flash></div>}
      {/* Only this barber's own diary: barber id comes from the session, never from the URL */}
      <Calendar settings={s} view={view} date={date} barbers={[{ id: u.barber_id, name: u.name }]} focusBarberId={u.barber_id} basePath="/barber/calendar" apptPath="/barber/appointments" allowAll={false} />
    </>
  );
}
