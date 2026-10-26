-- Backup/review first; Accounting/master/GR/IS and attachment prerequisites required.
-- Additive only. No legacy conversion, status change or stock posting.
BEGIN;
ALTER TABLE stock_returns
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS issue_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS warehouse_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS work_order_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS sender TEXT,
  ADD COLUMN IF NOT EXISTS receiver TEXT,
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS approved_by_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS stock_returns_request_key_key ON stock_returns(request_key);
ALTER TABLE stock_return_lines
  ADD COLUMN IF NOT EXISTS stock_issue_line_id TEXT REFERENCES stock_issue_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS product_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS issued_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previously_returned_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_qty DECIMAL(12,3) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS stock_return_lines_issue_line_idx ON stock_return_lines(stock_issue_line_id);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS stock_return_id TEXT REFERENCES stock_returns(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS attachments_stock_return_idx ON attachments(stock_return_id);
COMMIT;
