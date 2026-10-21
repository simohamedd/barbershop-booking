import bcrypt from "bcryptjs";
import { q, q1 } from "./db";

let dummyHash: string | undefined;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  return null;
}

/** Verify credentials with lockout after repeated failures. */
export async function verifyLogin(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const u = await q1<any>(`SELECT * FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
  const generic = "Email or password is incorrect.";
  if (!u) {
    dummyHash ??= await bcrypt.hash("timing-equaliser", 12);
    await bcrypt.compare(password, dummyHash); // equalise timing so unknown emails aren't detectable
    return { ok: false, message: generic };
  }
  if (!u.active) return { ok: false, message: "This account is deactivated. Ask the shop owner." };
  if (u.locked_until && +u.locked_until > Date.now()) return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
  const good = await bcrypt.compare(password, u.password_hash);
  if (!good) {
    await q(
      `UPDATE users SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`,
      [u.id],
    );
    return { ok: false, message: generic };
  }
  await q(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [u.id]);
  return { ok: true, userId: u.id };
}

