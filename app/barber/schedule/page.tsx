import { PageTitle } from "@/components/dash/Shell";
import { ScheduleEditor } from "@/components/dash/ScheduleEditor";
import { Flash } from "@/components/ui";
import { requireBarber } from "@/lib/auth";

export const metadata = { title: "My hours" };

export default async function MySchedule() {
  const u = await requireBarber();
  const canEdit = u.can_edit_schedule || u.role === "ADMIN";
  return (
    <>
      <PageTitle title="My hours" />
      {!canEdit && <div className="mb-4"><Flash kind="warn">Your hours are managed by the shop. Ask an admin to change them or book time off.</Flash></div>}
      <ScheduleEditor target={u.barber_id} readOnly={!canEdit} />
    </>
  );
}
