-- Review/back up first. Requires existing Accounting master tables.
-- Additive and re-runnable. No Stock/GL/balance changes.
BEGIN;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "supplier_snapshot" JSONB;
-- Freeze the currently available supplier identity, without changing any PO amounts.
UPDATE "purchase_orders" p SET "supplier_snapshot" = jsonb_build_object(
  'code', s."code", 'name', s."name", 'taxId', s."tax_id", 'tel', s."tel")
FROM "suppliers" s WHERE p."supplier_id" = s."id" AND p."supplier_snapshot" IS NULL;
CREATE TABLE IF NOT EXISTS "supplier_branches" (
  "id" TEXT PRIMARY KEY,
  "supplier_id" TEXT NOT NULL REFERENCES "suppliers"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "billing_address" TEXT,
  "contact_person" TEXT,
  "tel" TEXT,
  "fax" TEXT,
  "email" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_branches_supplier_id_code_key" ON "supplier_branches"("supplier_id", "code");
CREATE TABLE IF NOT EXISTS "supplier_banks" (
  "id" TEXT PRIMARY KEY,
  "branch_id" TEXT NOT NULL REFERENCES "supplier_branches"("id") ON DELETE CASCADE,
  "bank_name" TEXT NOT NULL,
  "bank_branch" TEXT,
  "bank_account_no" TEXT NOT NULL,
  "bank_account_name" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "supplier_banks_branch_id_idx" ON "supplier_banks"("branch_id");
-- Preserve scalar originals. Seed only suppliers with no branch.
INSERT INTO "supplier_branches" ("id", "supplier_id", "code", "name", "address", "billing_address", "contact_person", "tel", "fax", "email", "is_default")
SELECT 'sb_' || s."id", s."id", '00000', COALESCE(NULLIF(s."branch", ''), 'สำนักงานใหญ่'),
  s."address", s."billing_address", s."contact_person", s."tel", s."fax", s."email", true
FROM "suppliers" s
WHERE NOT EXISTS (SELECT 1 FROM "supplier_branches" b WHERE b."supplier_id" = s."id");
INSERT INTO "supplier_banks" ("id", "branch_id", "bank_name", "bank_branch", "bank_account_no", "bank_account_name", "is_default")
SELECT 'bank_' || s."id", b."id", COALESCE(s."bank_name", ''), s."bank_branch", s."bank_account_no", COALESCE(s."bank_account_name", ''), true
FROM "suppliers" s JOIN "supplier_branches" b ON b."id" = 'sb_' || s."id"
WHERE NULLIF(s."bank_account_no", '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "supplier_banks" bank WHERE bank."branch_id" = b."id");
COMMIT;
