-- Review/backup first; run after Accounting, master, PO, PS, PV/CQ and attachment prerequisites.
-- Additive only: legacy remains version 0. No data backfill or stock posting.
BEGIN;
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS po_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS warehouse_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS approved_by_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS goods_receipts_request_key_key ON goods_receipts(request_key);
ALTER TABLE goods_receipt_lines
  ADD COLUMN IF NOT EXISTS po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS product_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS "desc" TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS pending_qty DECIMAL(12,3) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS goods_receipt_lines_po_line_id_idx ON goods_receipt_lines(po_line_id);
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS attachments_goods_receipt_idx ON attachments(goods_receipt_id);
COMMIT;
