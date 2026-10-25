-- Review/back up before applying after SO/Invoice/BI/RV prerequisites.
-- No historical status/balance conversion. Deploy API/UI together.
BEGIN;
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_code TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS vat_config TEXT,
  ADD COLUMN IF NOT EXISTS original_before_vat DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS corrected_before_vat DECIMAL(12,2);
ALTER TABLE credit_note_lines
  ADD COLUMN IF NOT EXISTS part_no TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;
CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON credit_notes(invoice_id);
COMMIT;
