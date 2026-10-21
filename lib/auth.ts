import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "./crypto";
import { q, q1 } from "./db";
import type { Actor } from "./booking";
export { hashPassword, passwordProblem, verifyLogin } from "./auth-core";

export const SESSION_COOKIE = "bs_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "BARBER";
  barber_id: string | null;
  can_edit_schedule: boolean;
};

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), userId, expires]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return q1<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role, u.barber_id, COALESCE(b.can_edit_schedule, false) AS can_edit_schedule
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN barbers b ON b.id = u.barber_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [sha256(token)],
  );
});

export async function requireAdmin(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "ADMIN") redirect(u.barber_id ? "/barber" : "/login");
  return u;
}

/** Barber area: barbers, and admins who also have a barber profile. */
export async function requireBarber(): Promise<SessionUser & { barber_id: string }> {
  const u = await getUser();
  if (!u) redirect("/login?next=/barber");
  if (!u.barber_id) redirect(u.role === "ADMIN" ? "/admin" : "/login");
  return u as SessionUser & { barber_id: string };
}

export function actorOf(u: SessionUser): Actor {
  return { kind: "user", id: u.id, name: u.name, role: u.role, barberId: u.barber_id };
}
