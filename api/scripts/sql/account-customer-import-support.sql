-- Additive, re-runnable schema change for Accounting customer import support.
-- Touches Accounting customer tables only; no existing row is updated or deleted.
BEGIN;

ALTER TABLE "account_customers" ADD COLUMN IF NOT EXISTS "fax" TEXT;

ALTER TABLE "account_customer_branches" ADD COLUMN IF NOT EXISTS "contact_person" TEXT;
ALTER TABLE "account_customer_branches" ADD COLUMN IF NOT EXISTS "tel" TEXT;
ALTER TABLE "account_customer_branches" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "account_customer_branches" ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE TABLE IF NOT EXISTS "account_customer_secondary_sales" (
  "customer_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "account_customer_secondary_sales_pkey" PRIMARY KEY ("customer_id", "sale_id"),
  CONSTRAINT "account_customer_secondary_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "account_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "account_customer_secondary_sales_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "account_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "account_customer_secondary_sales_sale_id_idx" ON "account_customer_secondary_sales"("sale_id");

COMMIT;
