/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

export function Avatar({ name, photo, size = 56, dark = false }: { name: string; photo?: string; size?: number; dark?: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (photo) {
    return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={`display inline-flex shrink-0 items-center justify-center rounded-full border ${dark ? "border-brass/50 text-brass-light" : "border-brass/60 bg-white text-brass-dark"}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING: { label: "Pending approval", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  CONFIRMED: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-600" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-600" },
  CANCELLED: { label: "Cancelled", cls: "bg-neutral-100 text-neutral-600 ring-neutral-200", dot: "bg-neutral-400" },
  COMPLETED: { label: "Completed", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-600" },
  NO_SHOW: { label: "No-show", cls: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500" },
  EXPIRED: { label: "Expired", cls: "bg-neutral-100 text-neutral-600 ring-neutral-200", dot: "bg-neutral-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-neutral-100 ring-neutral-200", dot: "bg-neutral-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export const SOURCE_LABEL: Record<string, string> = { ONLINE: "Online", WHATSAPP: "WhatsApp", PHONE: "Phone", WALK_IN: "Walk-in", ADMIN: "Admin" };

export function Wordmark({ name, logo, light = false, href = "/", caps = false }: { name: string; logo?: string; light?: boolean; href?: string; caps?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${light ? "text-white" : "text-ink"}`}>
      {logo ? <img src={logo} alt="" className="h-8 w-8 object-contain" /> : (
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-brass" aria-hidden>
          <path fill="currentColor" d="M6 3a3 3 0 1 0 2.24 5l2.66 2.66-6.4 6.4a1 1 0 1 0 1.42 1.41l6.4-6.4 6.4 6.4a1 1 0 0 0 1.42-1.41l-6.4-6.4L16.4 8a3 3 0 1 0-1.42-1.42L12.32 9.24 9.66 6.58A3 3 0 0 0 6 3Zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm12 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
        </svg>
      )}
      <span className={caps ? "wordmark text-[17px] leading-none" : "display text-xl leading-none"}>{name}</span>
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-smoke">{children}</div>}
    </div>
  );
}

export function Flash({ kind = "ok", children }: { kind?: "ok" | "error" | "warn"; children: React.ReactNode }) {
  const cls = kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900";
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
