import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, json } from "@/lib/api";
import { createAppointment, manageUrl } from "@/lib/booking";
import { normalizePhone } from "@/lib/crypto";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  serviceId: z.string().uuid(),
  barberId: z.union([z.literal("any"), z.string().uuid()]),
  start: z.string().datetime(),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().min(7).max(25),
  email: z.union([z.literal(""), z.string().trim().email("Check your email address").max(120)]).optional(),
  message: z.string().trim().max(500).optional(),
  website: z.string().optional(), // honeypot: real people never fill this in
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, 400);
    const b = parsed.data;
    if (b.website) return json({ error: "Could not submit the booking." }, 400);
    const phone = normalizePhone(b.phone);
    if (!phone) return json({ error: "Enter a valid phone number, e.g. 07700 900123." }, 400);

    const ip = clientIp(req.headers);
    if (!(await rateLimit(`book:ip:${ip}`, 10, 3600))) return json({ error: "Too many booking attempts. Please try again later or call the shop." }, 429);
    const open = await q1<{ n: number }>(
      `SELECT count(*)::int n FROM appointments a JOIN customers c ON c.id = a.customer_id
       WHERE c.phone = $1 AND a.status = 'PENDING' AND a.start_at > now()`, [phone]);
    if ((open?.n ?? 0) >= 3) return json({ error: "You already have 3 requests waiting for approval. Please wait for those, or contact the shop." }, 429);

    const r = await createAppointment({
      serviceId: b.serviceId,
      barberId: b.barberId,
      start: new Date(b.start),
      customer: { name: b.name, phone, email: b.email || null },
      message: b.message,
      source: "ONLINE",
      status: "PENDING",
      actor: { kind: "customer" },
    });
    const url = manageUrl(r.reference, r.manageToken);
    return json({ reference: r.reference, url: url.replace(/^https?:\/\/[^/]+/, "") }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
