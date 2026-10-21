import Link from "next/link";
import { AppointmentDetail } from "@/components/dash/AppointmentDetail";
import { PageTitle } from "@/components/dash/Shell";
import { requireBarber } from "@/lib/auth";

export const metadata = { title: "Appointment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireBarber();
  const { id } = await params;
  return (
    <>
      <PageTitle title="Appointment" actions={<Link href="/barber/calendar" className="btn-line">My calendar</Link>} />
      <AppointmentDetail id={id} user={user} area="barber" />
    </>
  );
}
