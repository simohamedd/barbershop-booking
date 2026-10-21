/**
 * Appointment lifecycle. Every write path (online booking, admin manual booking, approvals,
 * reschedules, cancellations) goes through here so the same rules apply everywhere.
 *
 * Double-booking protection is layered:
 *  1. checkSlot() validates hours/breaks/time off/overlaps inside the transaction;
 *  2. the Postgres exclusion constraint `no_overlapping_appointments` rejects any overlapping
 *     PENDING/CONFIRMED range for the same barber, even under concurrent requests (SQLSTATE 23P01).
 */
import type { PoolClient } from "pg";
import { checkSlot, expireStalePending, findAlternatives, HARD_ISSUES, loadDay, type Alternatives, type Issue } from "./availability";
import { bookingReference, randomToken, sha256 } from "./crypto";
import { pgCode, q, q1, tx } from "./db";
import { notifyCustomerSafe, notifyUsers, staffRecipients, type CustomerEvent } from "./notify";
import { getSettings } from "./settings";
import { fmtDateTime, localDateISO } from "./time";

export type Status = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "NO_SHOW" | "EXPIRED";
export type Source = "ONLINE" | "WHATSAPP" | "PHONE" | "WALK_IN" | "ADMIN";

export type Actor =
  | { kind: "user"; id: string; name: string; role: "ADMIN" | "BARBER"; barberId: string | null }
  | { kind: "customer" }
  | { kind: "system" };

export class BookingError extends Error {
  constructor(
    public code: "UNAVAILABLE" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "BAD_STATE",
    message: string,
    public issues: Issue[] = [],
    public alternatives?: Alternatives,
  ) {
    super(message);
  }
}

const actorLabel = (a: Actor) => (a.kind === "user" ? a.name : a.kind === "customer" ? "Customer" : "System");
const actorId = (a: Actor) => (a.kind === "user" ? a.id : null);
const isAdmin = (a: Actor) => a.kind === "user" && a.role === "ADMIN";

export function manageUrl(reference: string, token: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/booking/${reference}?t=${encodeURIComponent(token)}`;
}

async function history(c: PoolClient, appointmentId: string, from: Status | null, to: Status | null, action: string, details: string, actor: Actor) {
  await q(
    `INSERT INTO appointment_history (appointment_id, from_status, to_status, action, details, actor_user_id, actor_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [appointmentId, from, to, action, details, actorId(actor), actorLabel(actor)],
    c,
  );
}

export type CreateInput = {
  serviceId: string;
  barberId: string | "any";
  start: Date;
  customer: { name: string; phone: string; email?: string | null };
  message?: string;
  staffNotes?: string;
  source: Source;
  status: "PENDING" | "CONFIRMED";
  /** Admin only: allow outside hours / breaks / time off / short notice. Overlaps are never allowed. */
  overrideSoftRules?: boolean;
  actor: Actor;
};

export type CreateResult = { id: string; reference: string; manageToken: string; barberId: string; status: Status };

export async function createAppointment(input: CreateInput): Promise<CreateResult> {
  const { actor } = input;
  if (input.status === "CONFIRMED" && !(actor.kind === "user")) throw new BookingError("FORBIDDEN", "Only staff can create confirmed bookings.");
  if (input.overrideSoftRules && !isAdmin(actor)) throw new BookingError("FORBIDDEN", "Only admins can override availability rules.");
  if (actor.kind === "user" && actor.role === "BARBER" && input.barberId !== actor.barberId) {
    throw new BookingError("FORBIDDEN", "Barbers can only create bookings on their own calendar.");
  }
  const isStaff = actor.kind === "user";

  let lastIssues: Issue[] = [];
  let durationMin = 0;
  try {
    const result = await tx(async (c) => {
      await expireStalePending(c);
      const settings = await getSettings(c);
      const service = await q1<any>(`SELECT * FROM services WHERE id = $1 AND deleted_at IS NULL`, [input.serviceId], c);
      if (!service || (!service.active && !isStaff)) throw new BookingError("INVALID", "That service is not available.");
      durationMin = service.duration_min;
      if (!isStaff && !settings.allow_online_booking) throw new BookingError("INVALID", "Online booking is currently switched off. Please contact the shop.");

      const dateISO = localDateISO(input.start, settings.timezone);
      const candidates =
        input.barberId === "any"
          ? (await q<{ id: string }>(
              `SELECT b.id FROM barbers b JOIN barber_services bs ON bs.barber_id = b.id
               LEFT JOIN LATERAL (SELECT count(*) n FROM appointments a WHERE a.barber_id = b.id
                 AND a.status IN ('PENDING','CONFIRMED') AND a.start_at::date = $2::date) load ON true
               WHERE bs.service_id = $1 AND b.active AND b.deleted_at IS NULL
               ORDER BY load.n, b.sort_order, b.name`,
              [input.serviceId, dateISO], c)).map((r) => r.id)
          : [input.barberId];
      if (!candidates.length) throw new BookingError("UNAVAILABLE", "No barber offers this service yet.");

      const ctx = await loadDay(dateISO, { barberIds: candidates, serviceId: input.serviceId, settings }, c);

      // Customer record (one per phone number)
      const cust = await q1<{ id: string }>(
        `INSERT INTO customers (name, phone, email) VALUES ($1, $2, $3)
         ON CONFLICT (phone) DO UPDATE SET
           name = CASE WHEN $4 THEN EXCLUDED.name ELSE customers.name END,
           email = COALESCE(CASE WHEN $4 THEN EXCLUDED.email END, customers.email, EXCLUDED.email),
           updated_at = now()
         RETURNING id`,
        [input.customer.name, input.customer.phone, input.customer.email || null, isStaff],
        c,
      );

      const start = +input.start;
      const end = start + service.duration_min * 60_000;
      const blockEnd = end + settings.buffer_minutes * 60_000;

      for (const barberId of candidates) {
        let issues = checkSlot(ctx, barberId, start, service.duration_min, { ignoreNotice: isStaff });
        if (input.overrideSoftRules) issues = issues.filter((i) => HARD_ISSUES.includes(i.code));
        if (issues.length) {
          lastIssues = issues;
          continue;
        }
        const manageToken = randomToken();
        await c.query("SAVEPOINT try_insert");
        try {
          let row: { id: string; reference: string } | null = null;
          for (let attempt = 0; attempt < 5 && !row; attempt++) {
            try {
              row = await q1(
                `INSERT INTO appointments (reference, customer_id, barber_id, service_id, customer_name, start_at, end_at, block_end_at,
                   status, source, price_pence, duration_min, service_name, customer_message, staff_notes, expires_at, manage_token_hash, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                 RETURNING id, reference`,
                [
                  bookingReference(), cust!.id, barberId, service.id, input.customer.name,
                  new Date(start), new Date(end), new Date(blockEnd), input.status, input.source,
                  service.price_pence, service.duration_min, service.name, input.message ?? "", input.staffNotes ?? "",
                  input.status === "PENDING" ? new Date(Date.now() + settings.pending_expiry_minutes * 60_000) : null,
                  sha256(manageToken), actorId(actor),
                ],
                c,
              );
            } catch (e) {
              if (pgCode(e) === "23505" && String((e as any).constraint).includes("reference")) {
                await c.query("ROLLBACK TO SAVEPOINT try_insert");
                continue;
              }
              throw e;
            }
          }
          if (!row) throw new Error("Could not allocate a booking reference");
          await c.query("RELEASE SAVEPOINT try_insert");

          const via = input.source === "ONLINE" ? "online" : `via ${input.source.toLowerCase().replace("_", "-")}`;
          await history(c, row.id, null, input.status, "created", `Booked ${via}${input.overrideSoftRules ? " (admin override of hours/breaks)" : ""}`, actor);

          const when = fmtDateTime(new Date(start), settings.timezone);
          const recipients = await staffRecipients(barberId, input.source === "ONLINE" || input.status === "PENDING", c);
          const filtered = recipients.filter((id) => id !== actorId(actor));
          await notifyUsers(
            filtered,
            input.status === "PENDING" ? `New booking request: ${input.customer.name}` : `New booking: ${input.customer.name}`,
            `${service.name} · ${when} · ${ctx.barbers.get(barberId)?.name ?? ""}${input.status === "PENDING" ? " — needs approval" : ""}`,
            row.id,
            c,
          );
          return { id: row.id, reference: row.reference, manageToken, barberId, status: input.status as Status };
        } catch (e) {
          if (pgCode(e) === "23P01") {
            // Lost a race: someone else took this slot between our check and insert.
            await c.query("ROLLBACK TO SAVEPOINT try_insert");
            lastIssues = [{ code: "OVERLAP", message: "That time was just taken by another booking." }];
            continue;
          }
          throw e;
        }
      }
      throw new BookingError("UNAVAILABLE", lastIssues[0]?.message ?? "That time is not available.", lastIssues);
    });

    await notifyCustomerSafe(result.id, result.status === "CONFIRMED" ? "CONFIRMED" : "REQUESTED", { manageUrl: manageUrl(result.reference, result.manageToken) });
    return result;
  } catch (e) {
    if (e instanceof BookingError && e.code === "UNAVAILABLE" && durationMin) {
      e.alternatives = await findAlternatives({
        serviceId: input.serviceId,
        durationMin,
        barberId: input.barberId === "any" ? null : input.barberId,
        start: input.start,
        ignoreNotice: isStaff,
      });
    }
    throw e;
  }
}

/* ----------------------------- status transitions ----------------------------- */

export type TransitionAction = "approve" | "reject" | "cancel" | "complete" | "no_show";
const TRANSITIONS: Record<TransitionAction, { from: Status[]; to: Status; event?: CustomerEvent }> = {
  approve: { from: ["PENDING"], to: "CONFIRMED", event: "CONFIRMED" },
  reject: { from: ["PENDING"], to: "REJECTED", event: "REJECTED" },
  cancel: { from: ["PENDING", "CONFIRMED"], to: "CANCELLED", event: "CANCELLED" },
  complete: { from: ["CONFIRMED"], to: "COMPLETED" },
  no_show: { from: ["CONFIRMED"], to: "NO_SHOW" },
};

async function loadForUpdate(c: PoolClient, id: string) {
  const a = await q1<any>(`SELECT * FROM appointments WHERE id = $1 FOR UPDATE`, [id], c);
  if (!a) throw new BookingError("NOT_FOUND", "Appointment not found.");
  return a;
}

function assertCanManage(actor: Actor, appt: { barber_id: string }) {
  if (actor.kind === "system") return;
  if (actor.kind === "customer") return; // customer access is verified by the caller (token / phone check)
  if (actor.role === "ADMIN") return;
  if (actor.barberId && actor.barberId === appt.barber_id) return;
  throw new BookingError("FORBIDDEN", "You can only manage your own appointments.");
}

export async function transition(id: string, action: TransitionAction, actor: Actor, reason = "") {
  const t = TRANSITIONS[action];
  if (!t) throw new BookingError("INVALID", "Unknown action.");
  if (actor.kind === "customer" && action !== "cancel") throw new BookingError("FORBIDDEN", "Not allowed.");

  const out = await tx(async (c) => {
    await expireStalePending(c);
    const a = await loadForUpdate(c, id);
    assertCanManage(actor, a);
    if (a.status === "EXPIRED" && action === "approve") throw new BookingError("BAD_STATE", "This request expired before it was approved, and its slot has been released.");
    if (!t.from.includes(a.status)) throw new BookingError("BAD_STATE", `Can't ${action.replace("_", "-")} an appointment that is ${a.status.toLowerCase().replace("_", "-")}.`);
    if ((action === "complete" || action === "no_show") && +a.start_at > Date.now()) {
      throw new BookingError("BAD_STATE", "You can mark this once the appointment time has started.");
    }
    if (actor.kind === "customer") {
      const s = await getSettings(c);
      if (+a.start_at - Date.now() < s.cancellation_cutoff_hours * 3_600_000) {
        throw new BookingError("BAD_STATE", `Online cancellation closes ${s.cancellation_cutoff_hours} hours before the appointment. Please contact the shop.`);
      }
    }
    await q(`UPDATE appointments SET status = $2, expires_at = NULL, updated_at = now() WHERE id = $1`, [id, t.to], c);
    const label = { approve: "approved", reject: "rejected", cancel: "cancelled", complete: "completed", no_show: "no-show" }[action];
    await history(c, id, a.status, t.to, label, reason, actor);

    const s = await getSettings(c);
    const when = fmtDateTime(a.start_at, s.timezone);
    if (actor.kind !== "user" || actor.role === "ADMIN" || action === "cancel") {
      const recips = (await staffRecipients(a.barber_id, actor.kind === "customer", c)).filter((u) => u !== actorId(actor));
      const verb = { approve: "approved", reject: "rejected", cancel: "cancelled", complete: "completed", no_show: "marked no-show" }[action];
      await notifyUsers(recips, `Booking ${verb}: ${a.customer_name}`, `${a.service_name} · ${when}${actor.kind === "customer" ? " — cancelled by the customer" : ` — by ${actorLabel(actor)}`}`, id, c);
    }
    return a;
  });
  if (t.event) await notifyCustomerSafe(id, t.event, { reason });
  return out;
}

/** Change time, barber and/or service. Same availability rules as new bookings. */
export async function reschedule(
  id: string,
  change: { start?: Date; barberId?: string; serviceId?: string; overrideSoftRules?: boolean },
  actor: Actor,
) {
  if (actor.kind !== "user") throw new BookingError("FORBIDDEN", "Only staff can reschedule. Customers can request a change.");
  if (change.overrideSoftRules && actor.role !== "ADMIN") throw new BookingError("FORBIDDEN", "Only admins can override availability rules.");
  if (actor.role === "BARBER" && change.barberId && change.barberId !== actor.barberId) throw new BookingError("FORBIDDEN", "Only admins can reassign to another barber.");

  let ctxInfo: { serviceId: string; duration: number; barberId: string; start: Date } | null = null;
  try {
    await tx(async (c) => {
      await expireStalePending(c);
      const a = await loadForUpdate(c, id);
      assertCanManage(actor, a);
      if (!["PENDING", "CONFIRMED"].includes(a.status)) throw new BookingError("BAD_STATE", "Only pending or confirmed appointments can be changed.");
      const settings = await getSettings(c);
      const serviceId = change.serviceId ?? a.service_id;
      const service = await q1<any>(`SELECT * FROM services WHERE id = $1 AND deleted_at IS NULL`, [serviceId], c);
      if (!service) throw new BookingError("INVALID", "Service not found.");
      const barberId = change.barberId ?? a.barber_id;
      const start = change.start ?? new Date(a.start_at);
      const duration = change.serviceId ? service.duration_min : a.duration_min;
      ctxInfo = { serviceId, duration, barberId, start };

      const ctx = await loadDay(localDateISO(start, settings.timezone), { barberIds: [barberId], serviceId, settings, excludeAppointmentId: id }, c);
      let issues = checkSlot(ctx, barberId, +start, duration, { ignoreNotice: true });
      if (change.overrideSoftRules) issues = issues.filter((i) => HARD_ISSUES.includes(i.code));
      if (issues.length) throw new BookingError("UNAVAILABLE", issues[0].message, issues);

      const end = new Date(+start + duration * 60_000);
      const blockEnd = new Date(+end + settings.buffer_minutes * 60_000);
      try {
        await q(
          `UPDATE appointments SET start_at=$2, end_at=$3, block_end_at=$4, barber_id=$5, service_id=$6, duration_min=$7,
             service_name=$8, price_pence=$9, reschedule_requested=false, updated_at=now() WHERE id=$1`,
          [id, start, end, blockEnd, barberId, serviceId, duration, service.name,
           change.serviceId ? service.price_pence : a.price_pence],
          c,
        );
      } catch (e) {
        if (pgCode(e) === "23P01") throw new BookingError("UNAVAILABLE", "That time overlaps another booking for this barber.", [{ code: "OVERLAP", message: "Overlaps another booking." }]);
        throw e;
      }
      const parts: string[] = [];
      if (+start !== +a.start_at) parts.push(`time ${fmtDateTime(a.start_at, settings.timezone)} → ${fmtDateTime(start, settings.timezone)}`);
      if (barberId !== a.barber_id) {
        const names = await q<{ id: string; name: string }>(`SELECT id, name FROM barbers WHERE id = ANY($1)`, [[a.barber_id, barberId]], c);
        const n = (x: string) => names.find((r) => r.id === x)?.name;
        parts.push(`barber ${n(a.barber_id)} → ${n(barberId)}`);
      }
      if (serviceId !== a.service_id) parts.push(`service ${a.service_name} → ${service.name}`);
      await history(c, id, a.status, a.status, barberId !== a.barber_id ? "reassigned" : "rescheduled", parts.join("; ") + (change.overrideSoftRules ? " (override)" : ""), actor);

      const when = fmtDateTime(start, settings.timezone);
      const recips = new Set<string>([...(await staffRecipients(barberId, false, c)), ...(await staffRecipients(a.barber_id, false, c))]);
      recips.delete(actor.id);
      await notifyUsers([...recips], `Booking changed: ${a.customer_name}`, `${service.name} · ${when}`, id, c);
    });
  } catch (e) {
    if (e instanceof BookingError && e.code === "UNAVAILABLE" && ctxInfo) {
      const ci = ctxInfo as { serviceId: string; duration: number; barberId: string; start: Date };
      e.alternatives = await findAlternatives({ serviceId: ci.serviceId, durationMin: ci.duration, barberId: ci.barberId, start: ci.start, ignoreNotice: true, excludeAppointmentId: id });
    }
    throw e;
  }
  await notifyCustomerSafe(id, "RESCHEDULED");
}

export async function addNote(id: string, note: string, actor: Actor) {
  if (actor.kind !== "user") throw new BookingError("FORBIDDEN", "Not allowed.");
  const clean = note.trim().slice(0, 2000);
  if (!clean) throw new BookingError("INVALID", "Write a note first.");
  await tx(async (c) => {
    const a = await loadForUpdate(c, id);
    assertCanManage(actor, a);
    const stamp = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${actor.name}] ${clean}`;
    await q(`UPDATE appointments SET staff_notes = CASE WHEN staff_notes = '' THEN $2 ELSE staff_notes || E'\n' || $2 END, updated_at = now() WHERE id = $1`, [id, stamp], c);
    await history(c, id, a.status, a.status, "note", clean, actor);
  });
}

/** Customer asks for a different time (staff then reschedule). */
export async function requestReschedule(id: string, note: string) {
  await tx(async (c) => {
    const a = await loadForUpdate(c, id);
    if (!["PENDING", "CONFIRMED"].includes(a.status)) throw new BookingError("BAD_STATE", "This booking can no longer be changed.");
    const clean = note.trim().slice(0, 500);
    await q(`UPDATE appointments SET reschedule_requested = true, reschedule_note = $2, updated_at = now() WHERE id = $1`, [id, clean], c);
    await history(c, id, a.status, a.status, "reschedule requested", clean, { kind: "customer" });
    const s = await getSettings(c);
    const recips = await staffRecipients(a.barber_id, true, c);
    await notifyUsers(recips, `Reschedule requested: ${a.customer_name}`, `${a.service_name} · ${fmtDateTime(a.start_at, s.timezone)}${clean ? ` — "${clean}"` : ""}`, id, c);
  });
}

/** Sweep for scheduled jobs: expire stale requests and tell those customers. */
export async function runExpirySweep() {
  await tx((c) => expireStalePending(c));
  // Bookings can also be expired lazily during other requests, so notify any not yet notified.
  const ids = (await q<{ id: string }>(
    `UPDATE appointments SET expiry_notified_at = now()
     WHERE status = 'EXPIRED' AND expiry_notified_at IS NULL RETURNING id`)).map((r) => r.id);
  for (const id of ids) {
    const a = await q1<any>(`SELECT barber_id, customer_name, service_name FROM appointments WHERE id = $1`, [id]);
    if (a) await notifyUsers(await staffRecipients(a.barber_id, true), `Request expired: ${a.customer_name}`, `${a.service_name} — not approved in time; slot released`, id);
    await notifyCustomerSafe(id, "EXPIRED");
  }
  return ids.length;
}
