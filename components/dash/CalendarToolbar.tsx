"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function CalendarToolbar(p: {
  basePath: string; view: "day" | "week" | "month"; date: string; today: string; prev: string; next: string; title: string;
  barbers: { id: string; name: string }[]; barberId: string | null; allowAll: boolean;
}) {
  const router = useRouter();
  const qs = (o: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const v = { view: p.view, date: p.date, barber: p.barberId, ...o };
    Object.entries(v).forEach(([k, val]) => val && sp.set(k, val));
    return `${p.basePath}?${sp}`;
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Link href={qs({ date: p.prev })} className="btn-line btn-sm" aria-label="Previous">‹</Link>
        <Link href={qs({ date: p.today })} className="btn-line btn-sm">Today</Link>
        <Link href={qs({ date: p.next })} className="btn-line btn-sm" aria-label="Next">›</Link>
      </div>
      <h2 className="text-lg font-semibold">{p.title}</h2>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {p.barbers.length > 1 && (
          <select aria-label="Barber" className="field w-auto py-1.5 text-sm" value={p.barberId ?? ""}
            onChange={(e) => router.push(qs({ barber: e.target.value || null, view: !e.target.value && p.view === "week" ? "day" : p.view }))}>
            {p.allowAll && <option value="">All barbers</option>}
            {p.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="inline-flex overflow-hidden rounded-md border border-line bg-white text-sm" role="group" aria-label="View">
          {(["day", "week", "month"] as const).map((v) => (
            <Link key={v} href={qs({ view: v, barber: v === "week" && !p.barberId ? p.barbers[0]?.id ?? null : p.barberId })}
              aria-current={p.view === v ? "true" : undefined}
              className={`px-3 py-1.5 capitalize ${p.view === v ? "bg-ink text-white" : "hover:bg-mist"}`}>{v}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
