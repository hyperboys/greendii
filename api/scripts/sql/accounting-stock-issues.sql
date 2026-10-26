-- Review and backup first. Apply after Accounting/master/GR and attachment prerequisites.
-- Additive only: no legacy conversion, balance changes or stock posting.
BEGIN;
ALTER TABLE stock_issues
  ADD COLUMN IF NOT EXISTS lifecycle_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS work_order_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS requester TEXT,
  ADD COLUMN IF NOT EXISTS receiver TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS approved_by_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS stock_issues_request_key_key ON stock_issues(request_key);
ALTER TABLE stock_issue_lines ADD COLUMN IF NOT EXISTS product_snapshot JSONB;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS stock_issue_id TEXT REFERENCES stock_issues(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS attachments_stock_issue_idx ON attachments(stock_issue_id);
COMMIT;
