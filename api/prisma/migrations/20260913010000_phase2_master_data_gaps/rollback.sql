-- Rollback Phase 2 Master Data Tables and Columns

ALTER TABLE IF EXISTS "stock_balances" DROP CONSTRAINT IF EXISTS "stock_balances_warehouse_id_fkey";
ALTER TABLE IF EXISTS "stock_balances" DROP CONSTRAINT IF EXISTS "stock_balances_product_id_fkey";

DROP TABLE IF EXISTS "chart_of_accounts";
DROP TABLE IF EXISTS "stock_balances";
DROP TABLE IF EXISTS "warehouses";
DROP TABLE IF EXISTS "suppliers";

ALTER TABLE IF EXISTS "products"
DROP COLUMN IF EXISTS "product_type",
DROP COLUMN IF EXISTS "vat_config";

ALTER TABLE IF EXISTS "customers"
DROP COLUMN IF EXISTS "code",
DROP COLUMN IF EXISTS "branch",
DROP COLUMN IF EXISTS "billing_address",
DROP COLUMN IF EXISTS "shipping_address",
DROP COLUMN IF EXISTS "vat_config",
DROP COLUMN IF EXISTS "credit_term";
