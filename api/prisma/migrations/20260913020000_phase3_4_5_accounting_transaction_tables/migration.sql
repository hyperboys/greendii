-- ─────────────────────────────────────────────
-- PHASE 3, 4, 5 MIGRATION: Transaction Tables & Inventory
-- ─────────────────────────────────────────────

-- CreateTable: provisional_delivery_orders
CREATE TABLE IF NOT EXISTS "provisional_delivery_orders" (
    "id" TEXT NOT NULL,
    "soNo" TEXT NOT NULL,
    "docDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "shipping_address" TEXT,
    "receiver" TEXT,
    "work_order_id" TEXT,
    "remark" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "sales_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisional_delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: provisional_delivery_order_lines
CREATE TABLE IF NOT EXISTS "provisional_delivery_order_lines" (
    "id" TEXT NOT NULL,
    "provisional_delivery_order_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT,
    "desc" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "remark" TEXT,

    CONSTRAINT "provisional_delivery_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoices
CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "ivNo" TEXT NOT NULL,
    "ivDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "tax_id" TEXT,
    "address" TEXT,
    "sales_id" TEXT,
    "customer_po_no" TEXT,
    "credit_term" INTEGER NOT NULL DEFAULT 30,
    "dueDate" TIMESTAMP(3) WITH TIME ZONE,
    "work_order_id" TEXT,
    "provisional_delivery_order_id" TEXT,
    "sub_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoice_lines
CREATE TABLE IF NOT EXISTS "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT,
    "desc" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: billing_notes
CREATE TABLE IF NOT EXISTS "billing_notes" (
    "id" TEXT NOT NULL,
    "biNo" TEXT NOT NULL,
    "billingDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "contact_person" TEXT,
    "expected_payment_date" TIMESTAMP(3) WITH TIME ZONE,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "sales_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: billing_note_invoices
CREATE TABLE IF NOT EXISTS "billing_note_invoices" (
    "id" TEXT NOT NULL,
    "billing_note_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "outstanding_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billing_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "billing_note_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: credit_notes
CREATE TABLE IF NOT EXISTS "credit_notes" (
    "id" TEXT NOT NULL,
    "cnNo" TEXT NOT NULL,
    "cnDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoice_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "reason" TEXT,
    "amount_before_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "sales_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: credit_note_lines
CREATE TABLE IF NOT EXISTS "credit_note_lines" (
    "id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "desc" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_before_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: receipt_vouchers
CREATE TABLE IF NOT EXISTS "receipt_vouchers" (
    "id" TEXT NOT NULL,
    "rvNo" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "payment_method" TEXT NOT NULL DEFAULT 'transfer',
    "bank_name" TEXT,
    "ref_no" TEXT,
    "cheque_no" TEXT,
    "cheque_date" TIMESTAMP(3) WITH TIME ZONE,
    "total_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wht_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "sales_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: receipt_allocations
CREATE TABLE IF NOT EXISTS "receipt_allocations" (
    "id" TEXT NOT NULL,
    "receipt_voucher_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "received_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wht_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: purchase_orders
CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNo" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchase_type" TEXT NOT NULL DEFAULT 'domestic',
    "supplier_id" TEXT,
    "supplier_branch" TEXT DEFAULT 'สำนักงานใหญ่',
    "address" TEXT,
    "contact_person" TEXT,
    "pr_id" TEXT,
    "sub_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_term" INTEGER NOT NULL DEFAULT 30,
    "delivery_date" TIMESTAMP(3) WITH TIME ZONE,
    "delivery_location" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: purchase_order_lines
CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT,
    "desc" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: contractor_payment_requests
CREATE TABLE IF NOT EXISTS "contractor_payment_requests" (
    "id" TEXT NOT NULL,
    "psNo" TEXT NOT NULL,
    "docDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "po_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "payment_round" INTEGER NOT NULL DEFAULT 1,
    "po_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "previously_requested_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_request_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wht" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: contractor_payment_request_lines
CREATE TABLE IF NOT EXISTS "contractor_payment_request_lines" (
    "id" TEXT NOT NULL,
    "contractor_payment_request_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "desc" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remark" TEXT,

    CONSTRAINT "contractor_payment_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: goods_receipts
CREATE TABLE IF NOT EXISTS "goods_receipts" (
    "id" TEXT NOT NULL,
    "grNo" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "po_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "warehouse_id" TEXT,
    "sender" TEXT,
    "receiver" TEXT,
    "remark" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: goods_receipt_lines
CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT,
    "ordered_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "previously_received_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "remaining_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "current_receipt_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_vouchers
CREATE TABLE IF NOT EXISTS "payment_vouchers" (
    "id" TEXT NOT NULL,
    "pvNo" TEXT NOT NULL,
    "pvDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" TEXT,
    "source_doc_type" TEXT,
    "source_doc_id" TEXT,
    "amount_before_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wht" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_payment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT NOT NULL DEFAULT 'transfer',
    "bank_account" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_voucher_lines
CREATE TABLE IF NOT EXISTS "payment_voucher_lines" (
    "id" TEXT NOT NULL,
    "payment_voucher_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "desc" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "payment_voucher_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cheque_payments
CREATE TABLE IF NOT EXISTS "cheque_payments" (
    "id" TEXT NOT NULL,
    "cqNo" TEXT NOT NULL,
    "payment_voucher_id" TEXT NOT NULL,
    "bank_account" TEXT NOT NULL,
    "cheque_no" TEXT NOT NULL,
    "chequeDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Prepared',
    "release_date" TIMESTAMP(3) WITH TIME ZONE,
    "remark" TEXT,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheque_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_issues
CREATE TABLE IF NOT EXISTS "stock_issues" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "work_order_id" TEXT,
    "warehouse_id" TEXT,
    "remark" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_issue_lines
CREATE TABLE IF NOT EXISTS "stock_issue_lines" (
    "id" TEXT NOT NULL,
    "stock_issue_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT NOT NULL,
    "requested_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "issued_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "cancelled_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_returns
CREATE TABLE IF NOT EXISTS "stock_returns" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "work_order_id" TEXT,
    "stock_issue_id" TEXT,
    "warehouse_id" TEXT,
    "condition" TEXT DEFAULT 'good',
    "remark" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "approvalStep" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_return_lines
CREATE TABLE IF NOT EXISTS "stock_return_lines" (
    "id" TEXT NOT NULL,
    "stock_return_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT NOT NULL,
    "returned_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_movements
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL,
    "movement_type" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "qty_in" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "source_doc_type" TEXT NOT NULL,
    "source_doc_id" TEXT NOT NULL,
    "source_doc_no" TEXT,
    "transaction_date" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "reversal_ref_id" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "provisional_delivery_orders_soNo_key" ON "provisional_delivery_orders"("soNo");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_ivNo_key" ON "invoices"("ivNo");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_notes_biNo_key" ON "billing_notes"("biNo");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_note_invoices_billing_note_id_invoice_id_key" ON "billing_note_invoices"("billing_note_id", "invoice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_notes_cnNo_key" ON "credit_notes"("cnNo");
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_vouchers_rvNo_key" ON "receipt_vouchers"("rvNo");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_poNo_key" ON "purchase_orders"("poNo");
CREATE UNIQUE INDEX IF NOT EXISTS "contractor_payment_requests_psNo_key" ON "contractor_payment_requests"("psNo");
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_grNo_key" ON "goods_receipts"("grNo");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_vouchers_pvNo_key" ON "payment_vouchers"("pvNo");
CREATE UNIQUE INDEX IF NOT EXISTS "cheque_payments_cqNo_key" ON "cheque_payments"("cqNo");
CREATE UNIQUE INDEX IF NOT EXISTS "cheque_payments_bank_account_cheque_no_key" ON "cheque_payments"("bank_account", "cheque_no");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_issues_issueNo_key" ON "stock_issues"("issueNo");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_returns_returnNo_key" ON "stock_returns"("returnNo");

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "stock_movements_product_id_warehouse_id_idx" ON "stock_movements"("product_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "stock_movements_source_doc_type_source_doc_id_idx" ON "stock_movements"("source_doc_type", "source_doc_id");
CREATE INDEX IF NOT EXISTS "stock_movements_transaction_date_idx" ON "stock_movements"("transaction_date");
