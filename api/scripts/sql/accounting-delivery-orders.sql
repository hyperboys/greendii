-- Additive fields for the supplied Accounting SO / Temporary Invoice template.
-- Back up and review the target database before applying; safe to re-run.
BEGIN;

ALTER TABLE provisional_delivery_orders
  ADD COLUMN IF NOT EXISTS customer_tel TEXT,
  ADD COLUMN IF NOT EXISTS customer_fax TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS credit_term INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS vat_config TEXT NOT NULL DEFAULT 'VAT7%',
  ADD COLUMN IF NOT EXISTS sub_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE provisional_delivery_order_lines
  ADD COLUMN IF NOT EXISTS part_no TEXT,
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Existing documents retain zero monetary values: historical prices/terms
-- cannot be inferred from today's Product/Customer master data.
COMMIT;
