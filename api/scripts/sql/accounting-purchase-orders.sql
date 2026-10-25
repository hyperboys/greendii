-- Additive schema support for detailed Accounting purchase orders.
-- Apply after reviewing the target database and taking a backup.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_config TEXT NOT NULL DEFAULT 'VAT7%',
  ADD COLUMN IF NOT EXISTS remarks TEXT;

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS part_no TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS remark TEXT;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS purchase_order_id TEXT;

CREATE TABLE IF NOT EXISTS purchase_order_purchase_requests (
  purchase_order_id TEXT NOT NULL,
  purchase_request_id TEXT NOT NULL,
  CONSTRAINT purchase_order_purchase_requests_pkey
    PRIMARY KEY (purchase_order_id, purchase_request_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_purchase_order_id_fkey'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_created_by_id_fkey'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_purchase_requests_purchase_order_id_fkey'
  ) THEN
    ALTER TABLE purchase_order_purchase_requests
      ADD CONSTRAINT purchase_order_purchase_requests_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_purchase_requests_purchase_request_id_fkey'
  ) THEN
    ALTER TABLE purchase_order_purchase_requests
      ADD CONSTRAINT purchase_order_purchase_requests_purchase_request_id_fkey
      FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS attachments_purchase_order_id_idx
  ON attachments(purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_purchase_requests_purchase_request_id_idx
  ON purchase_order_purchase_requests(purchase_request_id);

-- Preserve the existing one-PR relationship when upgrading older PO records.
INSERT INTO purchase_order_purchase_requests (purchase_order_id, purchase_request_id)
SELECT id, pr_id
FROM purchase_orders
WHERE pr_id IS NOT NULL
ON CONFLICT DO NOTHING;
