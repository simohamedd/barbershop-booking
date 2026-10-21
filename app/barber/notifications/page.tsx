import { NotificationsPage } from "@/components/dash/Notifications";
import { requireBarber } from "@/lib/auth";

export const metadata = { title: "Notifications" };
export default async function Page() {
  return <NotificationsPage user={await requireBarber()} apptPath="/barber/appointments" />;
}
