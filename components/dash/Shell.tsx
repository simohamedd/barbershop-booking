import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Wordmark } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { NavLinks } from "./NavLinks";
import { Toaster } from "./Toaster";

export async function Shell({ user, area, children }: { user: SessionUser; area: "admin" | "barber"; children: React.ReactNode }) {
  const [s, unread] = await Promise.all([
    getSettings(),
    q1<{ n: number }>(`SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [user.id]),
  ]);
  const admin = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/calendar", label: "Calendar" },
    { href: "/admin/appointments", label: "Appointments" },
    { href: "/admin/barbers", label: "Barbers" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/hours", label: "Working hours" },
    { href: "/admin/settings", label: "Settings" },
  ];
  const barber = [
    { href: "/barber", label: "Today" },
    { href: "/barber/calendar", label: "My calendar" },
    { href: "/barber/schedule", label: "My hours" },
    { href: "/barber/account", label: "Account" },
  ];
  const items = area === "admin" ? admin : barber;
  const base = `/${area}`;
  const n = unread?.n ?? 0;
  return (
    <div className="min-h-screen bg-mist lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-ink text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
          <Wordmark name={s.shop_name} logo={s.logo_url} light href={base} />
          <Link href={`${base}/notifications`} className="relative rounded-md p-2 text-white/80 hover:text-white lg:hidden" aria-label={`Notifications${n ? `, ${n} unread` : ""}`}>
            <Bell />{n > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brass" />}
          </Link>
        </div>
        <NavLinks items={items} />
        <div className="hidden border-t border-white/10 p-4 text-sm lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:block">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-xs text-white/50">{user.role === "ADMIN" ? "Admin" : "Barber"}</p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {area === "admin" && user.barber_id && <Link href="/barber" className="text-brass-light hover:underline">My barber view</Link>}
            {area === "barber" && user.role === "ADMIN" && <Link href="/admin" className="text-brass-light hover:underline">Admin</Link>}
            <Link href="/" className="text-white/60 hover:text-white">Website</Link>
            <form action={logout}><button className="text-white/60 hover:text-white">Sign out</button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="hidden h-16 items-center justify-end gap-4 border-b border-line bg-white px-8 lg:flex">
          <Link href={`${base}/notifications`} className="relative flex items-center gap-2 text-sm text-char hover:text-ink">
            <Bell />{n > 0 ? <span className="rounded-full bg-brass px-1.5 text-xs font-bold text-ink">{n}</span> : null}
            <span className="sr-only">Notifications</span>
          </Link>
        </div>
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        <Toaster />
        <form action={logout} className="px-4 pb-8 lg:hidden"><button className="text-sm text-smoke underline">Sign out ({user.name})</button></form>
      </div>
    </div>
  );
}

function Bell() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>;
}

export function PageTitle({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl">{title}</h1>
        {children && <div className="mt-1 text-sm text-smoke">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
