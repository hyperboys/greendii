-- Review and back up first. Apply after Accounting, inventory and Stock Card prerequisites.
-- Additive schema and enum only: no backfill, StockBalance overwrite, posting or shared execution.
BEGIN;
ALTER TYPE "DocStatus" ADD VALUE IF NOT EXISTS 'returned';

CREATE TABLE IF NOT EXISTS stock_opening_controls (
  id TEXT PRIMARY KEY DEFAULT 'default',
  cutover_date DATE NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_opening_balances (
  id TEXT PRIMARY KEY,
  opening_no TEXT NOT NULL UNIQUE,
  lifecycle_version INTEGER NOT NULL DEFAULT 1,
  request_key TEXT UNIQUE,
  request_hash TEXT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  warehouse_snapshot JSONB NOT NULL,
  cutover_date DATE NOT NULL,
  status "DocStatus" NOT NULL DEFAULT 'draft',
  approval_step INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  created_by_id TEXT,
  approved_at TIMESTAMPTZ(3),
  approved_by_id TEXT,
  cancelled_at TIMESTAMPTZ(3),
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS stock_opening_balances_warehouse_cutover_idx
  ON stock_opening_balances(warehouse_id, cutover_date);
CREATE INDEX IF NOT EXISTS stock_opening_balances_status_cutover_idx
  ON stock_opening_balances(status, cutover_date);
CREATE UNIQUE INDEX IF NOT EXISTS stock_opening_balances_active_warehouse_cutover_key
  ON stock_opening_balances(warehouse_id, cutover_date)
  WHERE status NOT IN ('cancelled', 'rejected');

CREATE TABLE IF NOT EXISTS stock_opening_balance_lines (
  id TEXT PRIMARY KEY,
  stock_opening_balance_id TEXT NOT NULL REFERENCES stock_opening_balances(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  product_id TEXT NOT NULL REFERENCES account_products(id) ON DELETE RESTRICT,
  product_snapshot JSONB NOT NULL,
  counted_qty DECIMAL(12,3) NOT NULL CHECK (counted_qty >= 0),
  book_qty_at_cutover DECIMAL(12,3) NOT NULL DEFAULT 0,
  delta_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  CONSTRAINT stock_opening_balance_lines_doc_product_key UNIQUE(stock_opening_balance_id, product_id)
);
CREATE INDEX IF NOT EXISTS stock_opening_balance_lines_product_idx ON stock_opening_balance_lines(product_id);

COMMIT;
