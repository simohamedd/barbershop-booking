import { NotificationsPage } from "@/components/dash/Notifications";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Notifications" };
export default async function Page() {
  return <NotificationsPage user={await requireAdmin()} apptPath="/admin/appointments" />;
}
