-- ═══════════════════════════════════════════════════════════════════════
--  OPD Accounting Engine Hardening — Migration 0002
--  Idempotent: safe to re-run
-- ═══════════════════════════════════════════════════════════════════════

-- 1. New columns on clinic_appointments
ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS gross_amount         NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount          NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount     NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_deduction_amount NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_delivered    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_amount        NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason        TEXT;

-- 2. accounting_event_log table
CREATE TABLE IF NOT EXISTS accounting_event_log (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       TEXT NOT NULL,
  source_id        TEXT,
  appointment_id   TEXT,
  posted_by_user   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'success',
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ael_appointment_id ON accounting_event_log(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ael_event_type ON accounting_event_log(event_type);

-- 3. Seed account 21850 (مقابل خصم الأطباء — liability)
INSERT INTO accounts (code, name, account_type, level, is_active)
VALUES ('21850', 'مقابل خصم الأطباء', 'liability', 2, true)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed account 4172 (إيراد مواعيد الغياب — revenue)
INSERT INTO accounts (code, name, account_type, level, is_active)
VALUES ('4172', 'إيراد مواعيد الغياب', 'revenue', 2, true)
ON CONFLICT (code) DO NOTHING;

-- 5. System setting: OPD no-show policy (default FORFEIT)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('opd_no_show_policy', 'FORFEIT', now())
ON CONFLICT (key) DO NOTHING;

-- 6. System setting: auto next period posting (default false = strict)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('allow_auto_next_period_posting', 'false', now())
ON CONFLICT (key) DO NOTHING;
