import { q1, type Queryable, pool } from "./db";

export type Settings = {
  shop_name: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  email: string;
  whatsapp_number: string;
  maps_url: string;
  hero_image_url: string;
  logo_url: string;
  timezone: string;
  currency: string;
  buffer_minutes: number;
  slot_interval_minutes: number;
  pending_expiry_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  cancellation_cutoff_hours: number;
  cancellation_policy: string;
  allow_online_booking: boolean;
  gallery_urls: string;
  established_year: number | null;
};

export async function getSettings(db: Queryable = pool()): Promise<Settings> {
  const s = await q1<Settings>(`SELECT * FROM shop_settings WHERE id = 1`, [], db);
  if (!s) throw new Error("shop_settings row missing — run migrations");
  return s;
}

export function formatMoney(pence: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: pence % 100 === 0 ? 0 : 2 }).format(pence / 100);
}

export function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
