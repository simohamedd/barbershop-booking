import Link from "next/link";
import { PageTitle } from "@/components/dash/Shell";
import { ScheduleEditor } from "@/components/dash/ScheduleEditor";
import { q } from "@/lib/db";

export const metadata = { title: "Working hours" };

export default async function Hours() {
  const barbers = await q<{ id: string; name: string }>(`SELECT id, name FROM barbers WHERE deleted_at IS NULL ORDER BY sort_order, name`);
  return (
    <>
      <PageTitle title="Working hours">Shop opening hours and closures. Each barber also has their own hours, breaks and days off.</PageTitle>
      <div className="mb-6 flex flex-wrap gap-2">
        {barbers.map((b) => <Link key={b.id} href={`/admin/hours/${b.id}`} className="btn-line btn-sm">{b.name}</Link>)}
      </div>
      <ScheduleEditor target="shop" />
    </>
  );
}
