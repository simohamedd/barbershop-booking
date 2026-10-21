import { q } from "./db";

export async function activeBarbers() {
  return q<{ id: string; name: string; service_ids: string[] }>(
    `SELECT b.id, b.name, COALESCE((SELECT array_agg(service_id) FROM barber_services WHERE barber_id = b.id), '{}') AS service_ids
     FROM barbers b WHERE b.active AND b.deleted_at IS NULL ORDER BY b.sort_order, b.name`,
  );
}

export async function activeServices() {
  return q<{ id: string; name: string; duration_min: number; price_pence: number }>(
    `SELECT id, name, duration_min, price_pence FROM services WHERE active AND deleted_at IS NULL ORDER BY sort_order, name`,
  );
}
