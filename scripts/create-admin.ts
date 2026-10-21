/*
 * Create (or reset the password of) an admin account.
 *   ADMIN_PASSWORD='...' npm run create-admin -- owner@yourshop.com "Owner Name"
 * If ADMIN_PASSWORD is not set, you'll be prompted (input hidden).
 */
import { createInterface } from "node:readline";
import { hashPassword, passwordProblem } from "../lib/auth-core";
import { pool } from "../lib/db";

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) (rl as any)._writeToOutput = (s: string) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a); });
  });
}

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = (emailArg || (await ask("Admin email: "))).trim().toLowerCase();
  const name = nameParts.join(" ") || (await ask("Name: ")) || "Admin";
  const password = process.env.ADMIN_PASSWORD || (await ask("Password (min 10 chars, letters + a number): ", true));
  const problem = passwordProblem(password);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That email address doesn't look right.");
  if (problem) throw new Error(problem);
  const hash = await hashPassword(password);
  const db = pool();
  await db.query(
    `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN', active = true, failed_logins = 0, locked_until = NULL`,
    [email, name, hash],
  );
  console.log(`Admin account ready: ${email}`);
  await db.end();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
