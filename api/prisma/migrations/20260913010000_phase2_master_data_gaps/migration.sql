-- ─────────────────────────────────────────────
-- PHASE 2 MIGRATION: Master Data Gaps
-- ─────────────────────────────────────────────

-- AlterTable: customers
ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "code" TEXT,
ADD COLUMN IF NOT EXISTS "branch" TEXT DEFAULT 'สำนักงานใหญ่',
ADD COLUMN IF NOT EXISTS "billing_address" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_address" TEXT,
ADD COLUMN IF NOT EXISTS "vat_config" TEXT DEFAULT 'VAT7%',
ADD COLUMN IF NOT EXISTS "credit_term" INTEGER DEFAULT 30;

-- AlterTable: products
ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "product_type" TEXT DEFAULT 'stored',
ADD COLUMN IF NOT EXISTS "vat_config" TEXT DEFAULT 'VAT7%';

-- CreateTable: suppliers
CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "address" TEXT,
    "billing_address" TEXT,
    "contact_person" TEXT,
    "tel" TEXT,
    "email" TEXT,
    "vat_config" TEXT DEFAULT 'VAT7%',
    "payment_term" INTEGER DEFAULT 30,
    "supplier_type" TEXT DEFAULT 'domestic',
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: warehouses
CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_balances
CREATE TABLE IF NOT EXISTS "stock_balances" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "on_hand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "available" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chart_of_accounts
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'detail',
    "account_mapping" TEXT,
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_code_key" ON "suppliers"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_code_key" ON "warehouses"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_balances_warehouse_id_product_id_key" ON "stock_balances"("warehouse_id", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_warehouse_id_fkey'
    ) THEN
        ALTER TABLE "stock_balances"
        ADD CONSTRAINT "stock_balances_warehouse_id_fkey"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_product_id_fkey'
    ) THEN
        ALTER TABLE "stock_balances"
        ADD CONSTRAINT "stock_balances_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
