import { NextResponse } from "next/server";
import { BookingError } from "./booking";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Map engine errors to HTTP responses with the details the UI needs (issues + alternatives). */
export function errorResponse(e: unknown) {
  if (e instanceof BookingError) {
    const status = { UNAVAILABLE: 409, CONFLICT: 409, NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, BAD_STATE: 409 }[e.code];
    return json({ error: e.message, code: e.code, issues: e.issues, alternatives: e.alternatives ?? null }, status);
  }
  console.error(e);
  return json({ error: "Something went wrong on our side. Please try again." }, 500);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
