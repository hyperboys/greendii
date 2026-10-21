-- Additive and re-runnable. Does not update or delete existing suppliers.
BEGIN;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "group_code" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "group_name" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "credit_limit" DECIMAL(14, 2);
COMMIT;
