-- ─────────────────────────────────────────────
-- MIGRATION: Separate Account Customer and Account Product
-- ─────────────────────────────────────────────

-- CreateTable: account_customers
CREATE TABLE IF NOT EXISTS "account_customers" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "tel" TEXT,
    "email" TEXT,
    "address" TEXT,
    "billing_address" TEXT,
    "shipping_address" TEXT,
    "branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "tax_id" TEXT,
    "type" TEXT DEFAULT 'นิติบุคคล',
    "vat_config" TEXT DEFAULT 'VAT7%',
    "credit_term" INTEGER DEFAULT 30,
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_products
CREATE TABLE IF NOT EXISTS "account_products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "product_type" TEXT DEFAULT 'stored',
    "vat_config" TEXT DEFAULT 'VAT7%',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_products_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "account_customers_code_key" ON "account_customers"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "account_products_code_key" ON "account_products"("code");
