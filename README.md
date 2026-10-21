# Barbershop Booking & Management System

A complete booking website and back office for a barbershop:

- **Public website** with services and prices, barber profiles and hours, contact details, and a mobile-first booking flow that needs no customer account.
- **Barber dashboard** with each barber's own calendar, booking requests to approve or reject, notes, completed/no-show, and their own hours and days off.
- **Admin dashboard** with a central calendar, all appointments with filters, manual bookings for WhatsApp, phone and walk-ins, barbers, services, customers, working hours, booking rules and statistics.

Built with **Next.js 15 (App Router) + PostgreSQL**. It deploys to Netlify (or Vercel) with a managed Postgres such as Neon, Supabase or Netlify DB.

---

## Contents

1. [How double-booking is prevented](#how-double-booking-is-prevented)
2. [Run it locally](#1-run-it-locally)
3. [Create the first admin account](#2-create-the-first-admin-account)
4. [Add barbers](#3-add-barbers)
5. [Configure services, hours and rules](#4-configure-services-hours-and-booking-rules)
6. [Deploy to Netlify with a managed database](#5-deploy-to-netlify)
7. [Customer notifications (email and WhatsApp)](#6-customer-notifications)
8. [Tests](#7-tests)
9. [Day-to-day use](#8-day-to-day-use)
10. [Security notes](#security-notes)
11. [Project structure](#project-structure)
12. [Limitations and next steps](#limitations-and-next-steps)

---

## How double-booking is prevented

This is enforced in three layers, so it holds even if two customers press "Book" at the same moment.

1. **One set of rules for every booking.** Online bookings, WhatsApp, phone and walk-in bookings, reschedules and reassignments all go through `lib/booking.ts`, which validates against `lib/availability.ts`. The rules are: working hours ∩ shop opening hours, minus breaks, minus days off and blocked time, minus existing **Pending** and **Confirmed** bookings. They use the service's real duration plus the admin-configured buffer.
2. **Inside a database transaction.** Expired pending holds are released first, then the time is re-checked and the row inserted.
3. **A PostgreSQL exclusion constraint** (`no_overlapping_appointments` in `db/migrations/001_init.sql`):

   ```sql
   EXCLUDE USING gist (barber_id WITH =, tstzrange(start_at, block_end_at, '[)') WITH &&)
   WHERE (status IN ('PENDING', 'CONFIRMED'))
   ```

   The database itself refuses any two overlapping Pending/Confirmed bookings for the same barber. Different barbers are unaffected, so they can serve customers at the same time. Rejected, Cancelled and Expired bookings are excluded from the constraint, so they release their slot immediately.

**Pending requests hold their slot.** A pending booking gets an approval deadline (Settings → "Approval window", default 2 hours). If the barber doesn't approve in time, the booking becomes **Expired** and the slot is released. This happens instantly whenever availability is checked, and every 5 minutes a scheduled job notifies the customer and barber.

Statuses: Pending approval, Confirmed, Rejected, Cancelled, Completed, No-show, plus **Expired** (a pending request nobody approved in time; it is kept separate from Rejected so the history is honest).

---

## 1. Run it locally

Requirements: **Node.js 20+** and **PostgreSQL 14+** (with the standard `btree_gist` extension, which is included in all mainstream Postgres builds including Neon and Supabase).

```bash
npm install
cp .env.example .env.local        # then edit it
```

Minimum `.env.local` for local development:

```bash
DATABASE_URL=postgres://postgres@localhost:5432/barbershop
APP_URL=http://localhost:3000
APP_SECRET=any-long-random-string-for-dev
CRON_SECRET=another-random-string
```

Create the database, apply the schema, and load sample data:

```bash
createdb barbershop
export $(grep -v '^#' .env.local | xargs)   # or use a tool like dotenv
npm run db:migrate
npm run db:seed -- --demo
npm run dev
```

Open http://localhost:3000.

`--demo` creates test logins, all with the password `demo-pass-2026`:

| Login | Role |
|---|---|
| admin@example.com | Admin |
| marcus@example.com | Barber (Marcus Reid) |
| idris@example.com | Barber (Idris Haddad) |
| tomasz@example.com | Barber (Tomasz Nowak) |
| leon@example.com | Barber (Leon Okafor) |

The sample data includes 4 barbers with different hours and lunch breaks, 7 services, shop opening hours, and a few bookings around today. **Never use `--demo` on your live database.**

To reset the sample data: `npm run db:seed -- --force --demo` (this wipes appointments, customers, barbers and services).

---

## 2. Create the first admin account

On a fresh (production) database, after `npm run db:migrate`:

```bash
DATABASE_URL="<your production connection string>" npm run create-admin -- owner@yourshop.co.uk "Your Name"
```

You'll be asked for a password (at least 10 characters, with letters and a number). Running it again for the same email resets that password, which is useful if you're locked out.

Then sign in at `/login`. Admins can add more admins later in **Settings → Admins**.

---

## 3. Add barbers

In the admin dashboard, go to **Barbers → Add barber**:

1. Fill in name, title, specialties and a short bio, and upload a photo. Photos are resized in the browser to 400×400 and stored in the database, so no file storage service is needed.
2. A new barber starts with the shop's opening hours and every service. Untick the services they don't do.
3. Click **Working hours & days off** to set their weekly hours, lunch break, holidays and blocked time.
4. Under **Login**, create their account with their email and a temporary password. Share it privately. They can change it under **Account**.
5. **Status and permissions:**
   - *Taking bookings* hides or shows them on the website.
   - *Can edit own hours and days off* controls whether they manage their own schedule or only admins can.
   - *Admin access* (on their login) gives them the full admin dashboard as well as their barber view.

Barbers can only see and act on **their own** appointments. They can't open the admin area or other barbers' bookings. This is checked on the server for every page and action, not just hidden in the menu.

---

## 4. Configure services, hours and booking rules

- **Services:** add, edit, hide or remove services. Each has a price, duration and the barbers who perform it. Changes affect new bookings only; existing bookings keep their price and duration.
- **Working hours:** set shop opening hours and closures (bank holidays, etc.). A barber can only be booked when both they are working **and** the shop is open.
- **Settings → Booking rules:**

| Setting | Default | What it does |
|---|---|---|
| Buffer after each appointment | 5 min | Cleanup time blocked after every booking |
| Time slot interval | 15 min | How often start times are offered |
| Approval window | 120 min | How long a pending request holds its slot |
| Minimum notice | 60 min | Latest a customer can book before a start time |
| Book up to | 60 days | How far ahead customers can book |
| Online cancellation closes | 2 h | Customers can cancel online until this point |
| Accept online bookings | On | Pause online booking (staff can still add bookings) |

- **Settings → Shop details:** name, address, phone, WhatsApp number (shown as a chat link), map link, homepage photo, logo, time zone and currency.

**Time zones:** all moments are stored in UTC (`timestamptz`). Weekly hours are wall-clock times in the shop's time zone (default `Europe/London`), so clock changes are handled correctly.

---

## 5. Deploy to Netlify

### a. Create the database

Any of these work. Copy the **pooled** connection string.

- **Neon** (https://neon.tech): create a project, then copy the pooled connection string (the host contains `-pooler`).
- **Netlify DB** (built on Neon): run `npx netlify db init` in the project.
- **Supabase**: Project settings → Database → connection pooling string.

Then apply the schema and create your admin from your computer:

```bash
DATABASE_URL="postgres://...pooled...?sslmode=require" npm run db:migrate
DATABASE_URL="postgres://...pooled...?sslmode=require" npm run create-admin -- you@yourshop.co.uk "Your Name"
# optional sample barbers/services (no demo logins):
DATABASE_URL="postgres://...?sslmode=require" npm run db:seed
```

### b. Create the site

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project →** pick the repo. Netlify reads `netlify.toml` and detects Next.js automatically.
3. Under **Site configuration → Environment variables**, add:
   - `DATABASE_URL`: the pooled connection string
   - `APP_URL`: your site URL, e.g. `https://brassandblade.netlify.app` (update it if you add a custom domain)
   - `APP_SECRET`: output of `openssl rand -base64 32`
   - `CRON_SECRET`: output of `openssl rand -hex 24`
   - optionally the email and WhatsApp variables (see below)
4. Deploy. The build runs `npm run db:migrate` first, so future schema changes apply automatically.

The scheduled function `netlify/functions/expire-pending.mts` runs every 5 minutes to release unapproved requests and notify customers. It shows under **Logs → Functions** once deployed.

### Vercel or another host

It works anywhere Next.js runs. Set the same environment variables, run `npm run db:migrate` before or at deploy, and call `POST /api/cron/expire` with the header `Authorization: Bearer <CRON_SECRET>` every few minutes (e.g. Vercel Cron, or any cron service).

---

## 6. Customer notifications

| Who | How | Setup |
|---|---|---|
| Barbers and admins | In-app notifications (bell icon) for new requests, cancellations, changes and expiries | None, always on |
| Customers | Their private booking page always shows live status | None, always on |
| Customers | Email on request, approval, rejection, cancellation, reschedule and expiry | `RESEND_API_KEY`, `EMAIL_FROM` |
| Customers | WhatsApp messages via the official WhatsApp Business Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` |

**Messages are never reported as sent unless the provider accepted them.** Every attempt is logged per appointment as *Sent*, *Failed* (with the provider's error) or *Not set up*. You can see this on each appointment page. **Settings → Customer notifications** shows which channels are configured.

**Email (Resend):** create an account at resend.com, verify your domain, create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain).

**WhatsApp:** this needs a Meta WhatsApp Business account and phone number. WhatsApp only allows business-initiated messages through **pre-approved templates**, so create a template (category *Utility*) whose body has two variables, for example:

> Hi {{1}}, {{2}}

Once approved, set `WHATSAPP_TEMPLATE_NAME` to its name, `WHATSAPP_TEMPLATE_LANG` to its language code (e.g. `en_GB`), plus `WHATSAPP_TOKEN` (a permanent system-user token) and `WHATSAPP_PHONE_NUMBER_ID`.

Customers book without an account. They get a **booking reference** (e.g. `BK-7KQ3MP`) and a **private link**. If they lose the link, they can use **Find my booking** with the reference plus the phone number they booked with.

---

## 7. Tests

**Booking engine tests** run against a real Postgres database. They create and remove their own test barbers, so they're safe on a development database, but don't run them against production.

```bash
DATABASE_URL=postgres://postgres@localhost:5432/barbershop npm test
```

They cover all the required scenarios plus edge cases: two barbers at the same time; overlaps refused (start inside, exact match, spanning); buffer time; pending holds its slot; rejection releases it; alternatives offered (other barbers and other times); "any barber" assignment; WhatsApp booking blocks the calendar; admin overlap can't be overridden but breaks can (with explicit override); **12 simultaneous requests for one slot result in exactly one booking**; the database rejects overlaps even when the app is bypassed; expiry releases slots; breaks, hours and time off; barbers can't act on others' bookings; no past bookings.

**End-to-end browser tests** drive the real UI against the running app with demo data:

```bash
npm run db:seed -- --force --demo
npm run build && npm start            # in another terminal
npx playwright install chromium       # first time only
node tests/e2e.mjs
```

They cover: a customer books on a phone-sized screen and the booking is pending; the slot is blocked for that barber but others are offered; a second customer is refused with alternatives; two barbers are booked at the same time; the barber approves from their dashboard and the customer sees Confirmed; admin rejection frees the slot; an admin WhatsApp booking appears on the barber's calendar; an admin conflict shows a clear warning and Save stays disabled; anonymous users and barbers are kept out of admin pages and other barbers' appointments; customer booking pages are private without the link.

---

## 8. Day-to-day use

**WhatsApp / phone booking:** Dashboard → **Add appointment** → enter name and phone → service → barber (or *Any available barber*) → date → tap a free time. The availability panel shows every barber's status at that time. If the chosen barber is busy, it lists who is free and other times. Choose **Confirmed** or **Pending barber approval**, then **Save**. The booking appears on the calendar immediately and blocks the slot.

**Approving requests:** barbers see requests at the top of their **Today** page, and admins on the **Dashboard**. Approve or reject in one tap; the reason you give on rejection is sent to the customer.

**Changing a booking:** open it from the calendar or Appointments to reschedule, change the service, reassign it to another barber (admin), cancel it, add notes, or mark it completed or a no-show. Every change is recorded in the appointment's history.

**Customer asked for a different time:** their booking shows *Change requested* with their note. Reschedule it from the appointment page and they're notified.

---

## Security notes

- Staff passwords are hashed with bcrypt (cost 12). Logins lock for 15 minutes after 5 failed attempts and are rate-limited per IP.
- Sessions are random 256-bit tokens stored hashed in the database, in `HttpOnly`, `SameSite=Lax` cookies (`Secure` in production). Deactivating a user ends their sessions.
- Role checks run server-side on every staff page and server action. The URL never decides which barber's data is shown: barbers' own IDs come from their session.
- Customer booking pages require the secret link token (stored only as a hash) or a reference + phone check. They're rate-limited and never indexed.
- Public booking is rate-limited per IP and limited to 3 waiting requests per phone number, and has a spam honeypot field.
- All input is validated server-side (zod). All SQL is parameterised.
- Security headers are set (no framing, no MIME sniffing, strict referrer policy).
- Customer data kept: name, phone, optional email, and their bookings. Nothing else is collected.

---

## Project structure

```
app/
  (site)/              public website: home, services, barbers, contact, book, booking/[ref]
  admin/               admin dashboard (calendar, appointments, barbers, services, customers, hours, settings)
  barber/              barber dashboard (today, calendar, hours, account)
  api/                 availability, bookings, cron/expire
  actions/             server actions shared by admin and barber dashboards
  login/               staff sign in
components/
  booking/BookingWizard.tsx   customer booking flow
  dash/                       calendar, appointment detail, manual booking, schedule editor
lib/
  availability.ts      the availability rules (single source of truth)
  booking.ts           create / approve / reject / cancel / reschedule (transactional)
  notify.ts            in-app, email and WhatsApp notifications with honest delivery logging
  auth.ts              sessions and role checks
db/migrations/         SQL schema (incl. the exclusion constraint)
scripts/               migrate, seed, create-admin
tests/                 engine tests (node:test) and end-to-end browser tests (Playwright)
netlify/functions/     scheduled expiry job
```

---

## Limitations and next steps

- **No online payments or deposits.** Customers pay in the shop. Stripe deposits could be added to the booking flow.
- **SMS** isn't included. The notification layer (`lib/notify.ts`) is built to add another channel such as Twilio.
- **Reminders** (e.g. 24 hours before) aren't sent yet. A second scheduled function using the same notification code would add them.
- **Photos** are stored in the database as small images. For many large images, move them to object storage (e.g. Netlify Blobs or S3).
- One location per installation. Several shops would need a `shop_id` on each table.
