import Link from "next/link";
import { fmtDateTime } from "@/lib/time";
import { SOURCE_LABEL } from "@/components/ui";
import { ActionForm, Submit } from "./forms";
import { apptTransition } from "@/app/actions/appointments";

export type PendingRow = { id: string; customer_name: string; service_name: string; start_at: Date; expires_at: Date | null; barber_name: string; source: string; customer_message: string };

export function PendingList({ rows, zone, apptPath, showBarber }: { rows: PendingRow[]; zone: string; apptPath: string; showBarber: boolean }) {
  if (!rows.length) return <p className="px-5 py-6 text-sm text-smoke">No requests waiting. New online bookings appear here.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Link href={`${apptPath}/${r.id}`} className="min-w-0 flex-1">
            <p className="font-semibold">{r.customer_name} <span className="font-normal text-smoke">· {r.service_name}</span></p>
            <p className="text-sm">{fmtDateTime(r.start_at, zone)}{showBarber ? ` with ${r.barber_name}` : ""} <span className="text-smoke">({SOURCE_LABEL[r.source]})</span></p>
            {r.customer_message && <p className="mt-1 truncate text-sm text-smoke">“{r.customer_message}”</p>}
            {r.expires_at && <p className="text-xs text-amber-800">Held until {fmtDateTime(r.expires_at, zone)}</p>}
          </Link>
          <div className="flex gap-2">
            <ActionForm action={apptTransition}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="approve" /><Submit className="btn-gold btn-sm" pendingText="…">Approve</Submit></ActionForm>
            <ActionForm action={apptTransition}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="reject" /><Submit className="btn-line btn-sm" pendingText="…" confirm="Reject this request? The slot will be released.">Reject</Submit></ActionForm>
          </div>
        </li>
      ))}
    </ul>
  );
}
