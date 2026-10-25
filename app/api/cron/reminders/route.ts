import type { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { safeEqual } from "@/lib/crypto";
import { runReminderSweep } from "@/lib/reminders";

/** Called on a schedule to send due appointment reminders. Same CRON_SECRET as the expiry job. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return json({ error: "Unauthorized" }, 401);
  return json({ reminded: await runReminderSweep() });
}
