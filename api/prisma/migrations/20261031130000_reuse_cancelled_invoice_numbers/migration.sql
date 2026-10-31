ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_ivNo_key";
DROP INDEX IF EXISTS "invoices_ivNo_key";

ALTER TABLE "invoices"
ADD COLUMN "reissued_from_id" TEXT;

CREATE UNIQUE INDEX "invoices_reissued_from_id_key"
ON "invoices"("reissued_from_id");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_reissued_from_id_fkey"
FOREIGN KEY ("reissued_from_id") REFERENCES "invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "invoices_ivNo_idx"
ON "invoices"("ivNo");

CREATE UNIQUE INDEX "invoices_ivNo_active_key"
ON "invoices"("ivNo")
WHERE "status" <> 'cancelled';
