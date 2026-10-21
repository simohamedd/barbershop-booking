"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, verifyLogin } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export async function login(_: { error?: string; email?: string } | null, fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!(await rateLimit(`login:${clientIp(await headers())}`, 20, 900))) return { error: "Too many attempts. Try again in 15 minutes.", email };
  const r = await verifyLogin(email, password);
  if (!r.ok) return { error: r.message, email };
  await createSession(r.userId);
  const u = await q1<{ role: string; barber_id: string | null }>(`SELECT role, barber_id FROM users WHERE id = $1`, [r.userId]);
  const next = String(fd.get("next") ?? "");
  const allowed = u?.role === "ADMIN" ? /^\/(admin|barber)(\/|$)/ : /^\/barber(\/|$)/;
  redirect(allowed.test(next) ? next : u?.role === "ADMIN" ? "/admin" : "/barber");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
