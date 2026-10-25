/** Netlify Scheduled Function: every 15 minutes, send reminders for confirmed appointments that are due. */
import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL || process.env.APP_URL;
  const res = await fetch(`${base}/api/cron/reminders`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log("send-reminders", res.status, await res.text());
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "*/15 * * * *" };
