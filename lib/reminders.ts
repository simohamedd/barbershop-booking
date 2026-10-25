/**
 * Appointment reminders. Run every 15 minutes by a scheduled job (netlify/functions/send-reminders.mts,
 * or the Docker scheduler). Each confirmed appointment gets at most one reminder, sent once it is within
 * `reminder_hours_before` of its start. Claiming rows with UPDATE ... RETURNING makes overlapping runs safe.
 */
import { q, type Queryable, pool } from "./db";
import { notifyCustomerSafe } from "./notify";
import { getSettings } from "./settings";

/** Appointments starting sooner than this are skipped: a reminder would arrive too late to be useful. */
const MIN_LEAD_MINUTES = 30;

export async function claimDueReminders(db: Queryable = pool()): Promise<string[]> {
  const s = await getSettings(db);
  if (!s.reminder_hours_before) return [];
  const rows = await q<{ id: string }>(
    `UPDATE appointments SET reminder_sent_at = now()
     WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL
       AND start_at >  now() + make_interval(mins => $2)
       AND start_at <= now() + make_interval(hours => $1)
     RETURNING id`,
    [s.reminder_hours_before, MIN_LEAD_MINUTES],
    db,
  );
  return rows.map((r) => r.id);
}

export async function runReminderSweep(): Promise<number> {
  const ids = await claimDueReminders();
  for (const id of ids) await notifyCustomerSafe(id, "REMINDER");
  return ids.length;
}
