-- Additive only: no existing document, status, amount or historical actor is changed.
CREATE TABLE "accounting_approval_configs" (
  "doc_type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "steps" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_approval_configs_pkey" PRIMARY KEY ("doc_type"),
  CONSTRAINT "accounting_approval_configs_type_check" CHECK
    ("doc_type" IN ('po','gr','is','sr','ps','pv','opening','invoice','bi','rv','cn')),
  CONSTRAINT "accounting_approval_configs_steps_check" CHECK
    (jsonb_typeof("steps") = 'array' AND (NOT "enabled" OR jsonb_array_length("steps") > 0))
);

-- A retained reference, not a duplicate image. Referenced immutable upload keys
-- must not be deleted when the profile signature is cleared.
CREATE TABLE "accounting_approval_signatures" (
  "url" TEXT NOT NULL PRIMARY KEY
);

ALTER TABLE "purchase_orders" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "goods_receipts" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "stock_issues" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "stock_returns" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "contractor_payment_requests" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "payment_vouchers" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "stock_opening_balances" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "invoices" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "billing_notes" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "receipt_vouchers" ADD COLUMN "accounting_approval" JSONB;
ALTER TABLE "credit_notes" ADD COLUMN "accounting_approval" JSONB;
