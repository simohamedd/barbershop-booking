import { Shell } from "@/components/dash/Shell";
import { requireBarber } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function BarberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBarber();
  return <Shell user={user} area="barber">{children}</Shell>;
}
