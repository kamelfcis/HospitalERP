-- OPD GL Accounting Migration — IFRS Revenue Deferral
-- Adds deferred revenue tracking for clinic consultation payments

-- 1. Add accounting tracking columns to clinic_appointments
ALTER TABLE clinic_appointments
  ADD COLUMN IF NOT EXISTS accounting_posted_advance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accounting_posted_revenue BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add source_entry_type to journal_entries for multi-entry per source document
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS source_entry_type TEXT;

-- 3. Drop old unique indexes (only allow one entry per source document — too restrictive)
DROP INDEX IF EXISTS idx_journal_entries_source;
DROP INDEX IF EXISTS idx_journal_entries_source_unique;

-- 4. Create new partial unique indexes
-- Legacy: preserves uniqueness for existing entries (sales_invoice, purchase_invoice, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_legacy
  ON journal_entries (source_type, source_document_id)
  WHERE source_entry_type IS NULL AND source_type IS NOT NULL AND source_document_id IS NOT NULL;

-- Typed: allows multiple entries per appointment (OPD_ADVANCE_RECEIPT, OPD_REVENUE_RECOGNITION, OPD_ADVANCE_REVERSAL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_typed
  ON journal_entries (source_type, source_document_id, source_entry_type)
  WHERE source_entry_type IS NOT NULL AND source_type IS NOT NULL AND source_document_id IS NOT NULL;
