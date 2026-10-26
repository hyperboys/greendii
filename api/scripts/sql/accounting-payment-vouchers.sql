-- Additive only. Requires prior Accounting, master, PS and attachment scripts.
-- Legacy remains version 0/read-only; no amounts or statuses are recalculated.
BEGIN;
ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS contractor_payment_request_id TEXT,
  ADD COLUMN IF NOT EXISTS source_no TEXT,
  ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS po_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS taxpayer_type TEXT,
  ADD COLUMN IF NOT EXISTS tax_description TEXT,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS paid_by_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_recorded_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS payer_bank TEXT,
  ADD COLUMN IF NOT EXISTS payee_bank TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS reversed_by_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_recorded_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS reversal_reference TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS payment_voucher_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_vouchers_request_key_key ON payment_vouchers(request_key);
CREATE INDEX IF NOT EXISTS payment_vouchers_source_doc_type_source_doc_id_idx ON payment_vouchers(source_doc_type, source_doc_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_vouchers_active_ps_unique ON payment_vouchers(source_doc_id)
  WHERE lifecycle_version = 1 AND source_doc_type = 'ps' AND status NOT IN ('cancelled', 'rejected');
CREATE INDEX IF NOT EXISTS attachments_payment_idx ON attachments(payment_voucher_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_vouchers_contractor_payment_request_id_fkey') THEN
    ALTER TABLE payment_vouchers ADD CONSTRAINT payment_vouchers_contractor_payment_request_id_fkey
      FOREIGN KEY (contractor_payment_request_id) REFERENCES contractor_payment_requests(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_payment_voucher_id_fkey') THEN
    ALTER TABLE attachments ADD CONSTRAINT attachments_payment_voucher_id_fkey
      FOREIGN KEY (payment_voucher_id) REFERENCES payment_vouchers(id) ON DELETE RESTRICT;
  END IF;
END;
$$;
COMMIT;
