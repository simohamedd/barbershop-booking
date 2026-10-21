"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, hashPassword, passwordProblem } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { q1, tx } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { loadSampleShop } from "@/lib/sample-data";

export async function needsSetup() {
  const r = await q1<{ n: number }>(`SELECT count(*)::int n FROM users WHERE role = 'ADMIN'`);
  return (r?.n ?? 0) === 0;
}

/** One-time creation of the first admin. Only works while no admin exists, and only with SETUP_TOKEN. */
type SetupState = { error?: string; values?: Record<string, string> } | null;

export async function runSetup(_: SetupState, fd: FormData): Promise<SetupState> {
  const keep = { shop_name: String(fd.get("shop_name") ?? ""), name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? "") };
  const fail = (error: string) => ({ error, values: keep });
  if (!(await rateLimit(`setup:${clientIp(await headers())}`, 10, 900))) return fail("Too many attempts. Try again in 15 minutes.");
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) return fail("Setup is disabled: the SETUP_TOKEN environment variable isn't set on the server.");
  if (!safeEqual(String(fd.get("token") ?? "").trim(), expected)) return fail("That setup key is incorrect.");
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (name.length < 2) return fail("Enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
  const prob = passwordProblem(password);
  if (prob) return fail(prob);
  const hash = await hashPassword(password);

  const userId = await tx(async (c) => {
    await c.query(`LOCK TABLE users IN EXCLUSIVE MODE`); // two setup attempts can't both win
    const existing = await q1<{ n: number }>(`SELECT count(*)::int n FROM users WHERE role = 'ADMIN'`, [], c);
    if (existing!.n > 0) return null;
    if (fd.get("sample") === "on") {
      const barbers = await q1<{ n: number }>(`SELECT count(*)::int n FROM barbers`, [], c);
      if (barbers!.n === 0) await loadSampleShop(c);
    }
    const shopName = String(fd.get("shop_name") ?? "").trim();
    if (shopName.length >= 2) await c.query(`UPDATE shop_settings SET shop_name = $1 WHERE id = 1`, [shopName.slice(0, 80)]);
    const u = await q1<{ id: string }>(`INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'ADMIN') RETURNING id`, [email, name, hash], c);
    return u!.id;
  });
  if (!userId) return fail("Setup has already been completed. Sign in instead.");
  await createSession(userId);
  redirect("/admin");
}
