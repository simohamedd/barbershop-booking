"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookingError, requestReschedule, transition } from "@/lib/booking";
import { normalizePhone } from "@/lib/crypto";
import { customerBooking, grantCustomerAccess, REF_RE } from "@/lib/customer-access";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export type FormState = { error?: string; ok?: string } | null;

export async function findBooking(_: FormState, fd: FormData): Promise<FormState> {
  const ref = String(fd.get("ref") ?? "").trim().toUpperCase().replace(/^BK-?/, "BK-");
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!(await rateLimit(`lookup:${clientIp(await headers())}`, 10, 900))) return { error: "Too many attempts. Please wait 15 minutes, or contact the shop." };
  if (!REF_RE.test(ref) || !phone) return { error: "Enter your booking reference (like BK-7KQ3MP) and the mobile number you booked with." };
  const a = await q1(`SELECT a.reference FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE a.reference = $1 AND c.phone = $2`, [ref, phone]);
  if (!a) return { error: "We couldn't find a booking with that reference and phone number." };
  await grantCustomerAccess(ref);
  redirect(`/booking/${ref}`);
}

export async function cancelBooking(_: FormState, fd: FormData): Promise<FormState> {
  const ref = String(fd.get("ref") ?? "");
  const a = await customerBooking(ref, String(fd.get("t") ?? ""));
  if (!a) return { error: "This link has expired. Find your booking again with your reference and phone number." };
  try {
    await transition(a.id, "cancel", { kind: "customer" }, String(fd.get("reason") ?? "").slice(0, 300) || "Cancelled by customer");
    return { ok: "Your booking is cancelled." };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}

export async function askToReschedule(_: FormState, fd: FormData): Promise<FormState> {
  const ref = String(fd.get("ref") ?? "");
  const a = await customerBooking(ref, String(fd.get("t") ?? ""));
  if (!a) return { error: "This link has expired. Find your booking again with your reference and phone number." };
  const note = String(fd.get("note") ?? "").trim();
  if (note.length < 3) return { error: "Tell us which days or times would suit you." };
  try {
    await requestReschedule(a.id, note);
    return { ok: "Request sent. The shop will move your booking and let you know." };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}
