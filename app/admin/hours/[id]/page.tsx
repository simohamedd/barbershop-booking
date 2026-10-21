import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/dash/Shell";
import { ScheduleEditor } from "@/components/dash/ScheduleEditor";
import { q1 } from "@/lib/db";

export const metadata = { title: "Barber hours" };

export default async function BarberHours({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await q1<{ name: string }>(`SELECT name FROM barbers WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!b) notFound();
  return (
    <>
      <PageTitle title={`${b.name}: hours`} actions={<><Link href="/admin/hours" className="btn-line">Shop hours</Link><Link href={`/admin/barbers/${id}`} className="btn-line">Profile</Link></>} />
      <ScheduleEditor target={id} />
    </>
  );
}
