BEGIN;

-- Existing invoices remain legacy records: no debt/status backfill.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(3);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS part_no TEXT;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS remark TEXT;

-- New lifecycle records may not reserve a source already used by any live record.
-- All application writers also serialize on the SO row (including legacy links).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_live_source_v1
  ON invoices (provisional_delivery_order_id)
  WHERE lifecycle_version = 1 AND status <> 'cancelled' AND provisional_delivery_order_id IS NOT NULL;

COMMIT;
