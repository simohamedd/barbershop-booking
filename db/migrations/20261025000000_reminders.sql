-- Appointment reminders: when each reminder went out, and how far ahead to send them (0 = off).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS reminder_hours_before integer NOT NULL DEFAULT 24
  CHECK (reminder_hours_before BETWEEN 0 AND 168);
CREATE INDEX IF NOT EXISTS appointments_reminder_due_idx
  ON appointments (start_at) WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL;
