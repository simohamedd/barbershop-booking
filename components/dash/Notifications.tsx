import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, Submit } from "./forms";
import { markNotificationsRead } from "@/app/actions/appointments";
import { PageTitle } from "./Shell";

export async function NotificationsPage({ user, apptPath }: { user: SessionUser; apptPath: string }) {
  const [s, rows] = await Promise.all([
    getSettings(),
    q(`SELECT id, title, body, appointment_id, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [user.id]),
  ]);
  return (
    <>
      <PageTitle title="Notifications" actions={rows.some((r: any) => !r.read_at) ? <ActionForm action={markNotificationsRead}><Submit className="btn-line">Mark all as read</Submit></ActionForm> : null} />
      <div className="panel">
        {rows.length === 0 ? <p className="p-6 text-sm text-smoke">No notifications yet. New booking requests, cancellations and changes appear here.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((n: any) => (
              <li key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.read_at ? "" : "bg-brass/5"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brass"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{n.appointment_id ? <Link className="hover:underline" href={`${apptPath}/${n.appointment_id}`}>{n.title}</Link> : n.title}</p>
                  <p className="text-sm text-char">{n.body}</p>
                  <p className="text-xs text-smoke">{fmtDateTime(n.created_at, s.timezone)}</p>
                </div>
                {!n.read_at && <ActionForm action={markNotificationsRead}><input type="hidden" name="id" value={n.id} /><Submit className="text-xs text-smoke underline" pendingText="…">Mark read</Submit></ActionForm>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
