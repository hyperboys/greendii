-- Additive rollout only. Run after reviewing a backup and existing PS data.
-- Never auto-approve/recalculate legacy rows; lifecycle_version=0 is read-only.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contractor_payment_requests
    GROUP BY po_id, payment_round HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate PS rounds exist. Reconcile legacy PO/round data before applying this script.';
  END IF;
END;
$$;
ALTER TABLE contractor_payment_requests
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS wht_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previously_retained_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_config TEXT NOT NULL DEFAULT 'NO_VAT',
  ADD COLUMN IF NOT EXISTS po_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ(3);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_payment_requests_request_key_key ON contractor_payment_requests(request_key);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_payment_requests_po_id_payment_round_key ON contractor_payment_requests(po_id, payment_round);
CREATE INDEX IF NOT EXISTS contractor_payment_requests_po_id_status_idx ON contractor_payment_requests(po_id, status);
COMMIT;
