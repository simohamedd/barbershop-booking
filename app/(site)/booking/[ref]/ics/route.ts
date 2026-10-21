import type { NextRequest } from "next/server";
import { customerBooking } from "@/lib/customer-access";
import { getSettings } from "@/lib/settings";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const a = await customerBooking(ref, req.nextUrl.searchParams.get("t"));
  if (!a) return new Response("Not found", { status: 404 });
  const s = await getSettings();
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//barbershop//booking//EN", "BEGIN:VEVENT",
    `UID:${a.reference}@barbershop`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(a.start_at))}`, `DTEND:${stamp(new Date(a.end_at))}`,
    `SUMMARY:${esc(`${a.service_name} with ${a.barber_name} – ${s.shop_name}`)}`,
    `LOCATION:${esc(s.address)}`, `DESCRIPTION:${esc(`Booking ${a.reference}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${a.reference}.ics"` } });
}
