-- Requires Accounting/master/PS/PV and attachment prerequisites.
-- Additive only; legacy amounts/statuses/numbers are never rewritten.
BEGIN;
ALTER TABLE cheque_payments
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS doc_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS pv_no TEXT,
  ADD COLUMN IF NOT EXISTS voucher_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS signer TEXT,
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS clearing_reference TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS cancelled_by_id TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reference TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS cheque_payment_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS cheque_payments_request_key_key ON cheque_payments(request_key);
CREATE UNIQUE INDEX IF NOT EXISTS cheque_payments_active_pv_unique ON cheque_payments(payment_voucher_id)
  WHERE lifecycle_version = 1 AND status <> 'Cancelled';
-- Expression index protects normalized new identities without mutating old account/cheque text.
CREATE UNIQUE INDEX IF NOT EXISTS cheque_payments_normalized_number_unique
  ON cheque_payments(regexp_replace(bank_account, '[[:space:]-]', '', 'g'), upper(cheque_no))
  WHERE lifecycle_version = 1;
CREATE INDEX IF NOT EXISTS attachments_cheque_idx ON attachments(cheque_payment_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_cheque_payment_id_fkey') THEN
    ALTER TABLE attachments ADD CONSTRAINT attachments_cheque_payment_id_fkey
      FOREIGN KEY (cheque_payment_id) REFERENCES cheque_payments(id) ON DELETE RESTRICT;
  END IF;
END;
$$;
COMMIT;
