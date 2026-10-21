import type { NextRequest } from "next/server";
import { DATE, errorResponse, json, UUID } from "@/lib/api";
import { dayCounts } from "@/lib/slots-service";

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const serviceId = p.get("serviceId") ?? "";
    const barberId = p.get("barberId") ?? "any";
    const from = p.get("from") ?? "";
    const days = Math.min(Math.max(Number(p.get("days") ?? 14), 1), 21);
    if (!UUID.test(serviceId) || !DATE.test(from) || (barberId !== "any" && !UUID.test(barberId))) return json({ error: "Invalid parameters" }, 400);
    const r = await dayCounts(serviceId, barberId, from, days);
    if (!r) return json({ error: "Service not found" }, 404);
    return json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
