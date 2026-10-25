-- Review after backup; deploy API/UI together after applying this additive rollout.
-- Historical billing notes remain lifecycle_version=0 without balance/status changes.
BEGIN;
ALTER TABLE billing_notes
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_code TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE billing_note_invoices
  ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS invoice_due_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS invoice_net_amount DECIMAL(12,2);
CREATE INDEX IF NOT EXISTS billing_note_invoices_invoice_idx ON billing_note_invoices(invoice_id);
COMMIT;
