import type { NextRequest } from "next/server";
import { DATE, errorResponse, json, UUID } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { slotsForDay } from "@/lib/slots-service";

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const serviceId = p.get("serviceId") ?? "";
    const barberId = p.get("barberId") ?? "any";
    const date = p.get("date") ?? "";
    if (!UUID.test(serviceId) || !DATE.test(date) || (barberId !== "any" && !UUID.test(barberId))) return json({ error: "Invalid parameters" }, 400);
    const staff = p.get("staff") === "1" ? Boolean(await getUser()) : false;
    const r = await slotsForDay(serviceId, barberId, date, { staff });
    if (!r) return json({ error: "Service not found" }, 404);
    return json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
