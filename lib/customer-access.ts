import { cookies } from "next/headers";
import { hmac, safeEqual, sha256 } from "./crypto";
import { q1 } from "./db";

export const REF_RE = /^BK-[A-Z0-9]{6}$/;
const cookieName = (ref: string) => `bk_${ref.replace(/[^A-Z0-9]/g, "")}`;

/** Load a booking only if the visitor proves access: the secret link token, or a prior reference+phone check. */
export async function customerBooking(ref: string, token?: string | null) {
  ref = ref.toUpperCase();
  if (!REF_RE.test(ref)) return null;
  const a = await q1<any>(
    `SELECT a.*, b.name AS barber_name, b.photo AS barber_photo, c.phone, c.email
     FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN customers c ON c.id = a.customer_id
     WHERE a.reference = $1`,
    [ref],
  );
  if (!a) return null;
  if (token && safeEqual(sha256(token), a.manage_token_hash)) return a;
  const jar = await cookies();
  const c = jar.get(cookieName(ref))?.value;
  if (c && safeEqual(c, hmac(`booking:${ref}`))) return a;
  return null;
}

export async function grantCustomerAccess(ref: string) {
  const jar = await cookies();
  jar.set(cookieName(ref), hmac(`booking:${ref}`), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/booking", maxAge: 60 * 60 * 24 * 7,
  });
}
