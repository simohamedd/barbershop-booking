import Link from "next/link";
import { AppointmentDetail } from "@/components/dash/AppointmentDetail";
import { PageTitle } from "@/components/dash/Shell";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Appointment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  return (
    <>
      <PageTitle title="Appointment" actions={<Link href="/admin/appointments" className="btn-line">All appointments</Link>} />
      <AppointmentDetail id={id} user={user} area="admin" />
    </>
  );
}
