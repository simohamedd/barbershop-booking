import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export function bookingReference() {
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `BK-${s}`;
}

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set (32+ random characters)");
    return "dev-only-insecure-secret-change-me";
  }
  return s;
}

export function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Normalise a phone number to +<digits>. Numbers starting with a single 0 get the default country code. */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d+$/.test(s)) s = "+" + (process.env.DEFAULT_COUNTRY_CODE || "44") + s.slice(1);
  if (/^\d+$/.test(s)) s = "+" + s;
  if (!/^\+\d{7,15}$/.test(s)) return null;
  return s;
}
