/**
 * Notifications.
 *  - Staff (barbers/admins): always in-app (notifications table), shown in the dashboard bell.
 *  - Customers: email via Resend and/or WhatsApp via the official WhatsApp Business Cloud API,
 *    ONLY when configured. Every attempt is logged with its real outcome
 *    (SENT / FAILED / NOT_CONFIGURED) — nothing is reported as sent unless the provider accepted it.
 */
import { q, q1, type Queryable, pool } from "./db";
import { getSettings } from "./settings";
import { fmtDateTime } from "./time";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME);
}

export async function notifyUsers(userIds: string[], title: string, body: string, appointmentId: string | null, db: Queryable = pool()) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;
  await q(
    `INSERT INTO notifications (user_id, appointment_id, channel, delivery, title, body)
     SELECT u, $2, 'IN_APP', 'DELIVERED', $3, $4 FROM unnest($1::uuid[]) AS u`,
    [unique, appointmentId, title, body],
    db,
  );
}

/** User ids to notify about an appointment: the barber's login (if any) and optionally all admins. */
export async function staffRecipients(barberId: string, includeAdmins: boolean, db: Queryable = pool()): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE active AND (barber_id = $1 OR ($2 AND role = 'ADMIN'))`,
    [barberId, includeAdmins],
    db,
  );
  return rows.map((r) => r.id);
}

export type CustomerEvent = "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "RESCHEDULED" | "EXPIRED" | "REMINDER";

/** Send customer-facing messages for an appointment event. Call AFTER the transaction commits. */
export async function notifyCustomer(appointmentId: string, event: CustomerEvent, extra: { manageUrl?: string; reason?: string } = {}) {
  const a = await q1<any>(
    `SELECT a.*, c.email, c.phone, b.name AS barber_name FROM appointments a
     JOIN customers c ON c.id = a.customer_id JOIN barbers b ON b.id = a.barber_id WHERE a.id = $1`,
    [appointmentId],
  );
  if (!a) return;
  const s = await getSettings();
  const when = fmtDateTime(a.start_at, s.timezone);
  const lines: Record<CustomerEvent, [string, string]> = {
    REQUESTED: [`Booking request received – ${a.reference}`, `Thanks ${a.customer_name}. Your request for ${a.service_name} with ${a.barber_name} on ${when} is waiting for the barber to approve it. We'll let you know as soon as it's confirmed.`],
    CONFIRMED: [`Booking confirmed – ${a.reference}`, `Good news ${a.customer_name}: ${a.service_name} with ${a.barber_name} on ${when} is confirmed. See you then.`],
    REJECTED: [`Booking not accepted – ${a.reference}`, `Sorry ${a.customer_name}, your request for ${when} with ${a.barber_name} couldn't be accepted${extra.reason ? `: ${extra.reason}` : "."} Please choose another time.`],
    CANCELLED: [`Booking cancelled – ${a.reference}`, `Your booking for ${a.service_name} on ${when} has been cancelled${extra.reason ? `: ${extra.reason}` : "."}`],
    RESCHEDULED: [`Booking changed – ${a.reference}`, `Your booking has been updated: ${a.service_name} with ${a.barber_name} on ${when}.`],
    EXPIRED: [`Booking request expired – ${a.reference}`, `Your request for ${when} wasn't approved in time, so the slot has been released. Please book another time.`],
    REMINDER: [`Reminder: ${a.service_name} on ${when}`, `Hi ${a.customer_name}, a reminder of your ${a.service_name} with ${a.barber_name} on ${when}${s.address ? ` at ${s.address}` : ""}. Booking reference ${a.reference}. Need to change it? Find your booking at ${(process.env.APP_URL || "").replace(/\/$/, "")}/booking${s.phone ? ` or call ${s.phone}` : ""}.`],
  };
  const [title, text] = lines[event];
  const body = extra.manageUrl ? `${text}\n\nView or manage your booking: ${extra.manageUrl}` : text;

  // Email
  if (a.email) {
    let delivery: "SENT" | "FAILED" | "NOT_CONFIGURED" = "NOT_CONFIGURED";
    let error: string | null = null;
    if (emailConfigured()) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [a.email], subject: `${s.shop_name}: ${title}`, text: body }),
        });
        delivery = r.ok ? "SENT" : "FAILED";
        if (!r.ok) error = `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
      } catch (e: any) {
        delivery = "FAILED";
        error = String(e?.message ?? e);
      }
    }
    await logCustomer(a.customer_id, appointmentId, "EMAIL", delivery, title, body, error);
  }

  // WhatsApp (official Cloud API; business-initiated messages must use an approved template
  // with two body parameters: {{1}} = customer name, {{2}} = message text)
  {
    let delivery: "SENT" | "FAILED" | "NOT_CONFIGURED" = "NOT_CONFIGURED";
    let error: string | null = null;
    if (whatsappConfigured()) {
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(a.phone).replace(/^\+/, ""),
            type: "template",
            template: {
              name: process.env.WHATSAPP_TEMPLATE_NAME,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en_GB" },
              components: [{ type: "body", parameters: [{ type: "text", text: a.customer_name }, { type: "text", text: text.slice(0, 900) }] }],
            },
          }),
        });
        delivery = r.ok ? "SENT" : "FAILED";
        if (!r.ok) error = `WhatsApp ${r.status}: ${(await r.text()).slice(0, 300)}`;
      } catch (e: any) {
        delivery = "FAILED";
        error = String(e?.message ?? e);
      }
    }
    await logCustomer(a.customer_id, appointmentId, "WHATSAPP", delivery, title, body, error);
  }
}

async function logCustomer(customerId: string, appointmentId: string, channel: string, delivery: string, title: string, body: string, error: string | null) {
  await q(
    `INSERT INTO notifications (customer_id, appointment_id, channel, delivery, title, body, error) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [customerId, appointmentId, channel, delivery, title, body, error],
  );
}

/** Fire-and-forget wrapper so a provider outage never breaks a booking action. */
export function notifyCustomerSafe(appointmentId: string, event: CustomerEvent, extra: { manageUrl?: string; reason?: string } = {}) {
  return notifyCustomer(appointmentId, event, extra).catch((e) => console.error("notifyCustomer failed", e));
}
