import type { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { runExpirySweep } from "@/lib/booking";
import { safeEqual } from "@/lib/crypto";

/** Called on a schedule (Netlify scheduled function / any cron) to release expired requests and notify customers. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return json({ error: "Unauthorized" }, 401);
  const expired = await runExpirySweep();
  return json({ expired });
}
