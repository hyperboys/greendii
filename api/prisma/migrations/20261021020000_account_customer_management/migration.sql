BEGIN;

CREATE TABLE "account_sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tel" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "account_sales_code_key" ON "account_sales"("code");

ALTER TABLE "account_customers" ADD COLUMN "responsible_sale_id" TEXT;
ALTER TABLE "account_customers" ADD CONSTRAINT "account_customers_responsible_sale_id_fkey"
    FOREIGN KEY ("responsible_sale_id") REFERENCES "account_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "account_customer_branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "account_customer_branches_customer_id_fkey" FOREIGN KEY ("customer_id")
        REFERENCES "account_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "account_customer_branches_customer_id_code_key"
    ON "account_customer_branches"("customer_id", "code");

CREATE TABLE "account_customer_addresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'both',
    "address" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "account_customer_addresses_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES "account_customer_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "account_customer_addresses_branch_id_idx" ON "account_customer_addresses"("branch_id");

-- Preserve legacy branches and each non-empty legacy address, without generating customer codes.
INSERT INTO "account_customer_branches" ("id", "customer_id", "code", "name")
SELECT 'legacy-branch-' || "id", "id", 'LEGACY', COALESCE(NULLIF(TRIM("branch"), ''), 'สำนักงานใหญ่')
FROM "account_customers";

INSERT INTO "account_customer_addresses" ("id", "branch_id", "label", "kind", "address", "position")
SELECT 'legacy-address-' || c."id" || '-' || a.kind, 'legacy-branch-' || c."id",
       a.label, a.kind, a.address, a.position
FROM "account_customers" c
CROSS JOIN LATERAL (VALUES
    ('both', 'ที่อยู่ทั่วไป', c."address", 0),
    ('billing', 'ที่อยู่วางบิล', c."billing_address", 1),
    ('shipping', 'ที่อยู่จัดส่ง', c."shipping_address", 2)
) AS a(kind, label, address, position)
WHERE NULLIF(TRIM(a.address), '') IS NOT NULL;

ALTER TABLE "invoices"
    ADD COLUMN "responsible_sale_id" TEXT,
    ADD COLUMN "responsible_sale_name" TEXT,
    ADD COLUMN "shipping_address" TEXT,
    ADD COLUMN "vat_config" TEXT;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_responsible_sale_id_fkey"
    FOREIGN KEY ("responsible_sale_id") REFERENCES "account_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
