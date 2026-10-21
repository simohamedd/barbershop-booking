"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { barbersForService, checkSlot, findAlternatives, loadDay, type Alternatives, type Issue } from "@/lib/availability";
import { actorOf, getUser } from "@/lib/auth";
import { addNote, BookingError, createAppointment, reschedule, transition, type TransitionAction } from "@/lib/booking";
import { normalizePhone } from "@/lib/crypto";
import { q, q1 } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { localToDate } from "@/lib/time";

type Result = { ok?: string; error?: string; issues?: Issue[] } | null;

async function staff() {
  const u = await getUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/barber", "layout");
}
function fail(e: unknown): Result {
  if (e instanceof BookingError) return { error: e.message, issues: e.issues };
  throw e;
}

const ACTIONS: TransitionAction[] = ["approve", "reject", "cancel", "complete", "no_show"];
const DONE: Record<TransitionAction, string> = { approve: "Approved. The customer has been notified.", reject: "Rejected. The slot is free again.", cancel: "Cancelled. The slot is free again.", complete: "Marked as completed.", no_show: "Marked as a no-show." };

export async function apptTransition(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const action = String(fd.get("action")) as TransitionAction;
  if (!ACTIONS.includes(action)) return { error: "Unknown action." };
  try {
    await transition(String(fd.get("id")), action, actorOf(u), String(fd.get("reason") ?? "").trim().slice(0, 300));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: DONE[action] };
}

export async function apptNote(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  try {
    await addNote(String(fd.get("id")), String(fd.get("note") ?? ""), actorOf(u));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Note added." };
}

export async function apptReschedule(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const s = await getSettings();
  const id = String(fd.get("id"));
  try {
    const date = String(fd.get("date") ?? "");
    const time = String(fd.get("time") ?? "");
    const barberId = String(fd.get("barberId") ?? "") || undefined;
    const serviceId = String(fd.get("serviceId") ?? "") || undefined;
    await reschedule(id, {
      start: date && time ? localToDate(date, time, s.timezone) : undefined,
      barberId,
      serviceId,
      overrideSoftRules: fd.get("override") === "on",
    }, actorOf(u));
  } catch (e) {
    if (e instanceof BookingError && e.alternatives) {
      const alt = describeAlternatives(e.alternatives);
      return { error: `${e.message}${alt ? ` ${alt}` : ""}`, issues: e.issues };
    }
    if (e instanceof Error && e.message.startsWith("Invalid")) return { error: "Choose a valid date and time." };
    return fail(e);
  }
  refresh();
  return { ok: "Appointment updated. The customer and barber have been notified." };
}

function describeAlternatives(a: Alternatives) {
  const parts: string[] = [];
  if (a.otherBarbersAtTime.length) parts.push(`Free at that time: ${a.otherBarbersAtTime.map((b) => b.name).join(", ")}.`);
  const first = a.sameBarberTimes[0];
  if (first?.slots.length) parts.push(`Other times: ${first.slots.slice(0, 5).map((x) => x.time).join(", ")} on ${first.date}.`);
  return parts.join(" ");
}

/* ------------------------------- manual booking ------------------------------- */

const Manual = z.object({
  serviceId: z.string().uuid(),
  barberId: z.union([z.literal("any"), z.string().uuid()]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export type CheckResult = {
  ok: boolean;
  error?: string;
  /** Per qualified barber: issues at the requested time (empty = free) */
  barbers: { id: string; name: string; issues: Issue[] }[];
  alternatives?: Alternatives;
};

/** Live availability check for the "Add appointment" form. Same rules as the booking engine. */
export async function checkManual(input: z.infer<typeof Manual>): Promise<CheckResult> {
  const u = await staff();
  const p = Manual.safeParse(input);
  if (!p.success) return { ok: false, error: "Choose a service, date and time.", barbers: [] };
  const s = await getSettings();
  const service = await q1<{ duration_min: number }>(`SELECT duration_min FROM services WHERE id = $1 AND deleted_at IS NULL`, [p.data.serviceId]);
  if (!service) return { ok: false, error: "Service not found.", barbers: [] };
  let start: Date;
  try { start = localToDate(p.data.date, p.data.time, s.timezone); } catch { return { ok: false, error: "Invalid date or time.", barbers: [] }; }
  let qualified = await barbersForService(p.data.serviceId);
  if (u.role === "BARBER") qualified = qualified.filter((b) => b.id === u.barber_id);
  const ctx = await loadDay(p.data.date, { barberIds: qualified.map((b) => b.id), serviceId: p.data.serviceId, settings: s });
  const barbers = qualified.map((b) => ({ id: b.id, name: b.name, issues: checkSlot(ctx, b.id, +start, service.duration_min, { ignoreNotice: true }) }));
  const chosen = p.data.barberId === "any" ? barbers : barbers.filter((b) => b.id === p.data.barberId);
  const ok = chosen.some((b) => b.issues.length === 0);
  const alternatives = ok ? undefined : await findAlternatives({ serviceId: p.data.serviceId, durationMin: service.duration_min, barberId: p.data.barberId === "any" ? null : p.data.barberId, start, ignoreNotice: true });
  return { ok, barbers, alternatives };
}

const Create = Manual.extend({
  name: z.string().trim().min(2, "Enter the customer's name").max(80),
  phone: z.string().trim().min(7, "Enter the customer's phone number").max(25),
  email: z.union([z.literal(""), z.string().trim().email("Check the email address")]).optional(),
  source: z.enum(["WHATSAPP", "PHONE", "WALK_IN", "ADMIN"]),
  status: z.enum(["PENDING", "CONFIRMED"]),
  notes: z.string().max(1000).optional(),
  override: z.boolean().optional(),
});

export async function createManual(input: z.infer<typeof Create>): Promise<{ ok: true; id: string } | { ok: false; error: string; issues?: Issue[]; alternatives?: Alternatives }> {
  const u = await staff();
  const p = Create.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const d = p.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, error: "Enter a valid phone number, e.g. 07700 900123." };
  const s = await getSettings();
  try {
    const r = await createAppointment({
      serviceId: d.serviceId,
      barberId: u.role === "BARBER" ? u.barber_id! : d.barberId,
      start: localToDate(d.date, d.time, s.timezone),
      customer: { name: d.name, phone, email: d.email || null },
      staffNotes: d.notes?.trim() ? `[${u.name}] ${d.notes.trim()}` : "",
      source: d.source,
      status: d.status,
      overrideSoftRules: u.role === "ADMIN" ? d.override : false,
      actor: actorOf(u),
    });
    refresh();
    return { ok: true, id: r.id };
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message, issues: e.issues, alternatives: e.alternatives };
    throw e;
  }
}

export async function markNotificationsRead(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const id = String(fd.get("id") ?? "");
  if (id) await q(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`, [id, u.id]);
  else await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [u.id]);
  refresh();
  return { ok: "Marked as read." };
}
