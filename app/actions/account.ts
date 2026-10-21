"use server";
import bcrypt from "bcryptjs";
import { getUser, hashPassword, passwordProblem } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

export async function changeOwnPassword(_: { ok?: string; error?: string } | null, fd: FormData) {
  const u = await getUser();
  if (!u) return { error: "Please sign in again." };
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const row = await q1<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [u.id]);
  if (!row || !(await bcrypt.compare(current, row.password_hash))) return { error: "Your current password is incorrect." };
  const prob = passwordProblem(next);
  if (prob) return { error: prob };
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The new passwords don't match." };
  await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [u.id, await hashPassword(next)]);
  return { ok: "Password changed." };
}
