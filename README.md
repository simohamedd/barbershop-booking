# Barbershop Booking & Management System

A complete booking website and back office for a barbershop:

- **Public website** with services and prices, barber profiles and hours, contact details, and a mobile-first booking flow that needs no customer account.
- **Barber dashboard** with each barber's own calendar, booking requests to approve or reject, notes, completed/no-show, and their own hours and days off.
- **Admin dashboard** with a central calendar, all appointments with filters, manual bookings for WhatsApp, phone and walk-ins, barbers, services, customers, working hours, booking rules and statistics.

Built with **Next.js 15 (App Router) + PostgreSQL**. It runs on Netlify (or Vercel) with any Postgres 14+, for example a free Neon database.

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
3. **A PostgreSQL exclusion constraint** (`no_overlapping_appointments` in `db/migrations/20261020000000_init.sql`):

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

**On a live site (easiest):** open `https://<your-site>/setup`. Enter the setup key (the `SETUP_TOKEN` environment variable), your name, email and a password, and optionally tick *Add sample barbers, services and opening hours*. You're signed straight into the admin dashboard.

The page only works while no admin exists. After that it redirects to `/login`, so nobody else can use it. You can delete `SETUP_TOKEN` from your environment variables once you're in.

**From a terminal (local or any database you can reach):**

```bash
DATABASE_URL="<connection string>" npm run create-admin -- owner@yourshop.co.uk "Your Name"
```

You'll be asked for a password (at least 10 characters, with letters and a number). Running it again for the same email resets that password, which is useful if you're locked out.

Admins can add more admins later in **Settings → Admins**.

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

- **Settings → Shop details:** name, tagline (the big homepage headline), about text, address, phone, WhatsApp number (shown as a chat link), map link, homepage photo, gallery photos (one link per line), the year the shop opened, logo, time zone and currency. Until you add your own photos, the site uses free-licence barbershop photos from Unsplash, credited in the footer.

**Time zones:** all moments are stored in UTC (`timestamptz`). Weekly hours are wall-clock times in the shop's time zone (default `Europe/London`), so clock changes are handled correctly.

---

## 5. Deploy to Netlify

### a. Create a free database (Neon)

1. Sign up at **https://neon.tech** (signing in with GitHub works).
2. Create a project. Choose Postgres 16+ and the region closest to your customers (London is `AWS eu-west-2`).
3. On the project dashboard, click **Connect**, turn **Connection pooling** on, and copy the connection string. It looks like `postgresql://user:password@ep-xxx-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require`.

Supabase, RDS or any Postgres 14+ works too. Use its pooled connection string.

### b. Create the Netlify project

1. In Netlify, create a project from the GitHub repository (**Add new project → Import an existing project**). If the project already exists, link it under **Project configuration → Developer settings → Continuous deployment → Link repository**. Netlify reads `netlify.toml` and detects Next.js.
2. Add these environment variables (**Project configuration → Environment variables**):
   - `DATABASE_URL`: the pooled connection string from step a
   - `APP_URL`: the site URL, e.g. `https://your-shop.netlify.app` (update it if you add a custom domain)
   - `APP_SECRET`: output of `openssl rand -base64 32`
   - `CRON_SECRET`: output of `openssl rand -hex 24`
   - `SETUP_TOKEN`: any long random string, used once at `/setup`
   - optionally the email and WhatsApp variables (see below)
3. Deploy. Each build runs `npm run db:migrate` first, which applies any new files in `db/migrations/` to your database. A failed migration fails the deploy, so a broken schema never goes live.
4. Open `/setup` to create your admin account (section 2).

From then on, every push to `main` redeploys. Deploy previews use the same `DATABASE_URL` as production unless you give the *Deploy Previews* context its own database in the environment variable settings. Doing that is recommended if you test risky changes in previews.

The scheduled function `netlify/functions/expire-pending.mts` runs every 5 minutes to release unapproved requests and notify customers. It shows under **Logs → Functions**.

**Schema changes:** add a new `.sql` file to `db/migrations/` with a later timestamp prefix. Applied files are recorded in the `schema_migrations` table and never run twice.

**Netlify Database:** this project doesn't use Netlify's built-in database because it isn't available on every plan. Don't add a `netlify/database` folder or the `@netlify/database` package, because either one makes Netlify try to create a database and fails the build on plans without it.

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
db/migrations/         SQL schema (incl. the exclusion constraint), applied on every Netlify build
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
