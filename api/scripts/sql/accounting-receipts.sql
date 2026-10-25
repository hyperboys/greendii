-- Back up and review before applying; deploy API/UI together with SO/IV/BI prerequisites.
-- Legacy receipts retain their status and balance effects; no historical data conversion.
BEGIN;
ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ(3);
ALTER TABLE receipt_vouchers
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_branch TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS wht_certificate_no TEXT;
ALTER TABLE receipt_allocations
  ADD COLUMN IF NOT EXISTS bank_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_note_id TEXT REFERENCES billing_notes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS invoice_net_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS outstanding_before DECIMAL(12,2);
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS receipt_voucher_id TEXT REFERENCES receipt_vouchers(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS receipt_allocations_invoice_idx ON receipt_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS receipt_allocations_billing_idx ON receipt_allocations(billing_note_id);
CREATE INDEX IF NOT EXISTS attachments_receipt_idx ON attachments(receipt_voucher_id);
COMMIT;
