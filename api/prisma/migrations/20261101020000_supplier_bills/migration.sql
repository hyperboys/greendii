-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" TEXT NOT NULL,
    "bill_no" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supplier_id" TEXT NOT NULL,
    "supplier_snapshot" JSONB NOT NULL,
    "supplier_invoice_no" TEXT NOT NULL,
    "supplier_invoice_no_key" TEXT NOT NULL,
    "supplier_invoice_date" TIMESTAMPTZ(3) NOT NULL,
    "tax_invoice_no" TEXT,
    "tax_invoice_no_key" TEXT,
    "tax_invoice_date" TIMESTAMPTZ(3),
    "credit_term_days" INTEGER NOT NULL,
    "due_date" TIMESTAMPTZ(3) NOT NULL,
    "due_date_manual" BOOLEAN NOT NULL DEFAULT false,
    "vat_mode" TEXT NOT NULL,
    "sub_total" DECIMAL(14,2) NOT NULL,
    "vat" DECIMAL(14,2) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "remark" TEXT,
    "created_by_id" TEXT NOT NULL,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_lines" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "desc" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "supplier_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_settlements" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "payment_voucher_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_by_id" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "supplier_bill_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_bill_no_key" ON "supplier_bills"("bill_no");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_request_key_key" ON "supplier_bills"("request_key");

-- CreateIndex
CREATE INDEX "supplier_bills_supplier_id_status_idx" ON "supplier_bills"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "supplier_bills_status_supplier_invoice_date_idx" ON "supplier_bills"("status", "supplier_invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bill_lines_bill_id_seq_key" ON "supplier_bill_lines"("bill_id", "seq");

-- CreateIndex
CREATE INDEX "supplier_bill_settlements_bill_id_status_idx" ON "supplier_bill_settlements"("bill_id", "status");

-- CreateIndex
CREATE INDEX "supplier_bill_settlements_payment_voucher_id_status_idx" ON "supplier_bill_settlements"("payment_voucher_id", "status");

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_settlements" ADD CONSTRAINT "supplier_bill_settlements_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_settlements" ADD CONSTRAINT "supplier_bill_settlements_payment_voucher_id_fkey" FOREIGN KEY ("payment_voucher_id") REFERENCES "payment_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Supplier bill register (actual AP liability). Additive only; no existing table is altered.
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_status_check" CHECK ("status" IN ('draft', 'confirmed', 'cancelled'));
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_vat_mode_check" CHECK ("vat_mode" IN ('VAT7', 'NO_VAT'));
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_amounts_check" CHECK ("sub_total" > 0 AND "vat" >= 0 AND "net_amount" = "sub_total" + "vat");
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_credit_term_check" CHECK ("credit_term_days" BETWEEN 0 AND 365);
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_due_date_check" CHECK ("due_date" >= "supplier_invoice_date");
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_revision_check" CHECK ("revision" >= 1);
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_amount_check" CHECK ("amount" > 0);
ALTER TABLE "supplier_bill_settlements" ADD CONSTRAINT "supplier_bill_settlements_status_check" CHECK ("status" IN ('active', 'voided'));
ALTER TABLE "supplier_bill_settlements" ADD CONSTRAINT "supplier_bill_settlements_amount_check" CHECK ("amount" > 0);

-- Concurrent duplicate protection: one non-cancelled bill per supplier invoice / tax invoice number.
CREATE UNIQUE INDEX "supplier_bills_active_supplier_invoice_key" ON "supplier_bills"("supplier_id", "supplier_invoice_no_key") WHERE "status" <> 'cancelled';
CREATE UNIQUE INDEX "supplier_bills_active_tax_invoice_key" ON "supplier_bills"("supplier_id", "tax_invoice_no_key") WHERE "status" <> 'cancelled' AND "tax_invoice_no_key" IS NOT NULL;
-- At most one active allocation row per bill/PV pair.
CREATE UNIQUE INDEX "supplier_bill_settlements_active_pair_key" ON "supplier_bill_settlements"("bill_id", "payment_voucher_id") WHERE "status" = 'active';