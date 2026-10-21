import { Shell } from "@/components/dash/Shell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <Shell user={user} area="admin">{children}</Shell>;
}
