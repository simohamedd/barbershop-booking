/*
 * End-to-end checks against a running app (npm run build && npm start), using the demo data
 * from `npm run db:seed -- --demo`.   BASE_URL=http://localhost:3000 node tests/e2e.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PW = "demo-pass-2026";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("PASS", name); }
  catch (e) { results.push(["FAIL", name]); console.log("FAIL", name, "\n   ", e.message.split("\n")[0]); }
}
const api = (path, init) => fetch(BASE + path, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const browser = await chromium.launch({ args: ["--no-proxy-server"] });
async function login(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await Promise.all([page.waitForURL(/\/(admin|barber)/), page.getByRole("button", { name: "Sign in" }).click()]);
  return { ctx, page };
}

// Reference data from the public site
const home = await (await fetch(`${BASE}/book`)).text();
assert.ok(home.includes("What are you having done?"), "booking page renders");

let bookingUrl = "", bookedStart = "", marcusId = "", haircutId = "";

await step("Customer books online with a chosen barber; booking is Pending Approval", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone-sized
  const page = await ctx.newPage();
  await page.goto(`${BASE}/book`);
  await page.getByRole("button", { name: /^Haircut\b/ }).first().click();
  await page.getByRole("button", { name: /Marcus Reid/ }).click();
  await page.getByRole("heading", { name: "Pick a time" }).waitFor();
  const slot = page.locator("button.h-11:not(.line-through)").filter({ hasText: /^1[4-6]:/ }).first(); // mid-afternoon, when all barbers work
  await slot.waitFor({ timeout: 15000 });
  await slot.click();
  await page.fill("#name", "E2E Customer One");
  await page.fill("#phone", "07700 900555");
  await page.fill("#email", "e2e@example.com");
  await Promise.all([page.waitForURL(/\/booking\/BK-/), page.getByRole("button", { name: "Request booking" }).click()]);
  bookingUrl = page.url();
  await page.getByText("Pending approval").first().waitFor();
  await page.getByText(/Waiting for Marcus to approve/).waitFor();
  await ctx.close();
});

await step("The pending booking blocks that slot for Marcus but other barbers stay bookable", async () => {
  const html = await (await fetch(bookingUrl)).text();
  const m = html.match(/(\w{3} \d{1,2} \w{3} \d{4}), (\d{2}:\d{2})/);
  assert.ok(m, "booking page shows the date and time");
  const d = new Date(Date.parse(`${m[1].slice(4)} 12:00 UTC`));
  const iso = d.toISOString().slice(0, 10);
  const time = m[2];
  const svcPage = await (await fetch(`${BASE}/services`)).text();
  haircutId = svcPage.match(/\/book\?service=([0-9a-f-]{36})/)[1];
  const barbersPage = await (await fetch(`${BASE}/barbers`)).text();
  marcusId = barbersPage.match(/\/book\?barber=([0-9a-f-]{36})/)[1];
  const r = await api(`/api/availability?serviceId=${haircutId}&barberId=${marcusId}&date=${iso}`);
  const s = r.body.slots.find((x) => x.time === time);
  assert.ok(s, `time ${time} listed (other barbers free)`);
  assert.equal(s.available, false, "Marcus not available at his pending time");
  assert.ok(s.freeBarberIds.length > 0, "other barbers offered at that time");
  bookedStart = s.start;
});

await step("A second customer requesting Marcus at the same time is refused, with alternatives", async () => {
  const r = await api("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceId: haircutId, barberId: marcusId, start: bookedStart, name: "E2E Customer Two", phone: "07700900556" }) });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /already has a pending booking/);
  assert.ok(r.body.alternatives.otherBarbersAtTime.length > 0, "other barbers suggested");
  assert.ok(r.body.alternatives.sameBarberTimes[0].slots.length > 0, "other Marcus times suggested");
});

await step("Two different barbers can be booked at the same time", async () => {
  const r1 = await api(`/api/availability?serviceId=${haircutId}&barberId=any&date=${bookedStart.slice(0, 10)}`);
  const s = r1.body.slots.find((x) => x.start === bookedStart);
  const other = s.freeBarberIds[0];
  const r = await api("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceId: haircutId, barberId: other, start: bookedStart, name: "E2E Customer Three", phone: "07700900557" }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

await step("Marcus approves the request from his dashboard; customer sees Confirmed", async () => {
  const { page, ctx } = await login("marcus@example.com");
  assert.ok(page.url().endsWith("/barber"));
  const row = page.locator("section", { hasText: "Requests waiting for you" }).locator("li", { hasText: "E2E Customer One" });
  await row.getByRole("button", { name: "Approve" }).click();
  await page.getByText("Approved. The customer has been notified.").waitFor();
  await ctx.close();
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(bookingUrl);
  await p.getByText("Confirmed").first().waitFor();
  await c.close();
});

await step("Rejecting a pending request releases its slot", async () => {
  // Customer Three is pending with another barber at bookedStart; reject as admin
  const { page, ctx } = await login("admin@example.com");
  await page.goto(`${BASE}/admin/appointments?q=E2E Customer Three`);
  await page.getByRole("link", { name: /,\s\d{2}:\d{2}/ }).first().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reject request" }).click();
  await page.getByText("Rejected. The slot is free again.").waitFor();
  await ctx.close();
  const r = await api(`/api/availability?serviceId=${haircutId}&barberId=any&date=${bookedStart.slice(0, 10)}`);
  const s = r.body.slots.find((x) => x.start === bookedStart);
  assert.ok(s && s.freeBarberIds.length >= 1, "slot free again for the other barber");
});

await step("Admin creates a WhatsApp booking and it appears on the barber's calendar", async () => {
  const { page, ctx } = await login("admin@example.com");
  await page.goto(`${BASE}/admin/appointments/new`);
  await page.fill("#m-name", "WhatsApp Walter");
  await page.fill("#m-phone", "07700 900777");
  await page.selectOption("#m-source", "WHATSAPP");
  await page.selectOption("#m-barber", { label: "Tomasz Nowak" });
  // Next Tomasz working day: pick the first free time chip
  for (let i = 1; i < 10; i++) {
    const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    await page.fill("#m-date", d);
    await page.waitForTimeout(600);
    if (await page.locator("form button.tabular-nums").count()) break;
  }
  await page.locator("form button.tabular-nums").first().click();
  await page.getByText("This time is free.").waitFor();
  await page.fill("#m-notes", "Customer contacted us through WhatsApp");
  await Promise.all([page.waitForURL(/\/admin\/calendar\?view=day/), page.getByRole("button", { name: "Save appointment" }).click()]);
  await page.getByText("Appointment saved and added to the calendar.").waitFor();
  await page.locator("a", { hasText: "WhatsApp Walter" }).first().waitFor();
  await ctx.close();
  // And on Tomasz's own calendar
  const t = await login("tomasz@example.com");
  await t.page.goto(`${BASE}/barber`);
  await t.page.getByText("WhatsApp Walter").first().waitFor();
  await t.ctx.close();
});

await step("Admin gets a clear warning and cannot save a conflicting booking", async () => {
  const { page, ctx } = await login("admin@example.com");
  await page.goto(`${BASE}/admin/appointments/new`);
  await page.fill("#m-name", "Clash Test");
  await page.fill("#m-phone", "07700 900888");
  await page.selectOption("#m-barber", { label: "Marcus Reid" });
  const local = new Date(bookedStart);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(local);
  const g = (t) => parts.find((p) => p.type === t).value;
  await page.fill("#m-date", `${g("year")}-${g("month")}-${g("day")}`);
  await page.fill("#m-time", `${g("hour")}:${g("minute")}`);
  await page.getByText("Marcus Reid can't take this time.").waitFor();
  await page.getByText(/already has a confirmed booking/).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Save appointment" }).isDisabled(), true, "save disabled");
  await ctx.close();
});

await step("Unauthorised users can't reach admin or another barber's appointments", async () => {
  // Anonymous
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${BASE}/admin`);
  assert.match(ap.url(), /\/login\?next=%2Fadmin/);
  const r = await fetch(`${BASE}/barber/calendar`, { redirect: "manual" });
  assert.equal(r.status, 307);
  await anon.close();
  // Barber Idris tries admin pages and Marcus's appointment
  const { page, ctx } = await login("idris@example.com");
  await page.goto(`${BASE}/admin`);
  assert.match(page.url(), /\/barber$/, "barber bounced from /admin");
  await page.goto(`${BASE}/admin/settings`);
  assert.match(page.url(), /\/barber$/);
  const admin = await login("admin@example.com");
  await admin.page.goto(`${BASE}/admin/appointments?q=E2E Customer One`);
  const href = await admin.page.getByRole("link", { name: /,\s\d{2}:\d{2}/ }).first().getAttribute("href");
  await admin.ctx.close();
  const id = href.split("/").pop();
  const resp = await page.goto(`${BASE}/barber/appointments/${id}`);
  assert.equal(resp.status(), 404, "Idris cannot open Marcus's appointment");
  await ctx.close();
});

await step("Customer booking page is private without the secret link", async () => {
  const ref = bookingUrl.match(/BK-[A-Z0-9]+/)[0];
  const r = await (await fetch(`${BASE}/booking/${ref}`)).text();
  assert.ok(r.includes("We need to check it&#x27;s you") || r.includes("We need to check it's you"));
  assert.ok(!r.includes("E2E Customer One"), "no personal data shown");
});

await browser.close();
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
