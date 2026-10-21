/**
 * Netlify Scheduled Function: every 5 minutes, release pending requests that weren't approved in time
 * and notify those customers. (Slots are also released instantly whenever availability is checked;
 * this job makes sure customers and barbers hear about it.)
 */
import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL || process.env.APP_URL;
  const res = await fetch(`${base}/api/cron/expire`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log("expire-pending", res.status, await res.text());
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "*/5 * * * *" };
