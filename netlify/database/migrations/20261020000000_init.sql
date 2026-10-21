-- Barbershop booking system: initial schema
-- All instants are stored as timestamptz (UTC). Recurring hours are stored as local wall-clock
-- times and interpreted in the shop time zone (shop_settings.timezone).

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'BARBER');
CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED');
CREATE TYPE appointment_source AS ENUM ('ONLINE', 'WHATSAPP', 'PHONE', 'WALK_IN', 'ADMIN');

-- Single-row shop settings
CREATE TABLE shop_settings (
  id                        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name                 text NOT NULL DEFAULT 'Barbershop',
  tagline                   text NOT NULL DEFAULT '',
  about                     text NOT NULL DEFAULT '',
  address                   text NOT NULL DEFAULT '',
  phone                     text NOT NULL DEFAULT '',
  email                     text NOT NULL DEFAULT '',
  whatsapp_number           text NOT NULL DEFAULT '',
  maps_url                  text NOT NULL DEFAULT '',
  hero_image_url            text NOT NULL DEFAULT '',
  logo_url                  text NOT NULL DEFAULT '',
  timezone                  text NOT NULL DEFAULT 'Europe/London',
  currency                  text NOT NULL DEFAULT 'GBP',
  buffer_minutes            integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120),
  slot_interval_minutes     integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes IN (5, 10, 15, 20, 30, 60)),
  pending_expiry_minutes    integer NOT NULL DEFAULT 120 CHECK (pending_expiry_minutes BETWEEN 5 AND 10080),
  min_notice_minutes        integer NOT NULL DEFAULT 60 CHECK (min_notice_minutes >= 0),
  max_advance_days          integer NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 365),
  cancellation_cutoff_hours integer NOT NULL DEFAULT 2 CHECK (cancellation_cutoff_hours >= 0),
  cancellation_policy       text NOT NULL DEFAULT '',
  allow_online_booking      boolean NOT NULL DEFAULT true,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE barbers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  slug               text NOT NULL UNIQUE,
  title              text NOT NULL DEFAULT '',
  bio                text NOT NULL DEFAULT '',
  specialties        text NOT NULL DEFAULT '',
  phone              text NOT NULL DEFAULT '',
  photo              text NOT NULL DEFAULT '',          -- URL or small data: URI (resized client-side)
  active             boolean NOT NULL DEFAULT true,
  can_edit_schedule  boolean NOT NULL DEFAULT true,     -- may change own hours, breaks, time off
  sort_order         integer NOT NULL DEFAULT 0,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  name             text NOT NULL,
  password_hash    text NOT NULL,
  role             user_role NOT NULL,
  barber_id        uuid UNIQUE REFERENCES barbers(id) ON DELETE SET NULL,
  active           boolean NOT NULL DEFAULT true,
  failed_logins    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price_pence   integer NOT NULL CHECK (price_pence >= 0),
  duration_min  integer NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE barber_services (
  barber_id   uuid NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (barber_id, service_id)
);

-- Weekly recurring hours. barber_id NULL = shop opening hours.
-- weekday: 1 = Monday ... 7 = Sunday (ISO). Several rows per day allow split shifts.
CREATE TABLE working_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid REFERENCES barbers(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX working_hours_barber_idx ON working_hours(barber_id, weekday);

-- Weekly recurring breaks (e.g. lunch)
CREATE TABLE breaks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  label       text NOT NULL DEFAULT 'Break',
  CHECK (end_time > start_time)
);
CREATE INDEX breaks_barber_idx ON breaks(barber_id, weekday);

-- One-off blocked periods: holidays, days off, ad-hoc blocks. barber_id NULL = whole shop closed.
CREATE TABLE time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid REFERENCES barbers(id) ON DELETE CASCADE,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  kind        text NOT NULL DEFAULT 'BLOCK' CHECK (kind IN ('BLOCK', 'HOLIDAY', 'DAY_OFF', 'CLOSURE')),
  reason      text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX time_off_barber_idx ON time_off(barber_id, start_at, end_at);

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text NOT NULL UNIQUE,      -- normalised, digits with leading +
  email       text,
  notes       text NOT NULL DEFAULT '',  -- internal, staff only
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          text NOT NULL UNIQUE,
  customer_id        uuid NOT NULL REFERENCES customers(id),
  barber_id          uuid NOT NULL REFERENCES barbers(id),
  service_id         uuid NOT NULL REFERENCES services(id),
  customer_name      text NOT NULL,            -- snapshot at booking time
  start_at           timestamptz NOT NULL,
  end_at             timestamptz NOT NULL,     -- start + service duration
  block_end_at       timestamptz NOT NULL,     -- end + buffer; the period this booking occupies
  status             appointment_status NOT NULL,
  source             appointment_source NOT NULL DEFAULT 'ONLINE',
  price_pence        integer NOT NULL,
  duration_min       integer NOT NULL,
  service_name       text NOT NULL,            -- snapshot
  customer_message   text NOT NULL DEFAULT '', -- what the customer wrote
  staff_notes        text NOT NULL DEFAULT '', -- internal: barber/admin notes
  expires_at         timestamptz,              -- for PENDING: when the hold lapses
  manage_token_hash  text NOT NULL,
  reschedule_requested boolean NOT NULL DEFAULT false,
  reschedule_note    text NOT NULL DEFAULT '',
  expiry_notified_at timestamptz,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (block_end_at >= end_at),

  -- THE double-booking guarantee: the database itself refuses two slot-holding appointments
  -- for the same barber whose occupied periods overlap. Concurrent inserts are serialised by
  -- the exclusion constraint, so a race can never produce a double booking.
  CONSTRAINT no_overlapping_appointments EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(start_at, block_end_at, '[)') WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'))
);
CREATE INDEX appointments_barber_time_idx ON appointments(barber_id, start_at);
CREATE INDEX appointments_status_idx ON appointments(status, start_at);
CREATE INDEX appointments_customer_idx ON appointments(customer_id);
CREATE INDEX appointments_pending_expiry_idx ON appointments(expires_at) WHERE status = 'PENDING';

CREATE TABLE appointment_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status     appointment_status,
  to_status       appointment_status,
  action          text NOT NULL,     -- created, approved, rejected, rescheduled, reassigned, note, ...
  details         text NOT NULL DEFAULT '',
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_label     text NOT NULL,     -- 'Customer', 'System', or user name
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_history_appt_idx ON appointment_history(appointment_id, created_at);

-- In-app notifications for staff, plus a delivery log for customer-facing channels.
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,       -- staff recipient (in-app)
  customer_id     uuid REFERENCES customers(id) ON DELETE CASCADE,   -- customer recipient
  appointment_id  uuid REFERENCES appointments(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'WHATSAPP')),
  delivery        text NOT NULL CHECK (delivery IN ('DELIVERED', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  error           text,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX notifications_appt_idx ON notifications(appointment_id);

-- Simple fixed-window rate limiting for public endpoints (booking, lookup, login)
CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  count        integer NOT NULL,
  window_end   timestamptz NOT NULL
);

INSERT INTO shop_settings (id) VALUES (1);
