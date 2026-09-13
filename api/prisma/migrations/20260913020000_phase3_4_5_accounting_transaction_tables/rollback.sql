-- Rollback Phase 3, 4, 5 Accounting & Inventory Tables

DROP TABLE IF EXISTS "stock_movements";
DROP TABLE IF EXISTS "stock_return_lines";
DROP TABLE IF EXISTS "stock_returns";
DROP TABLE IF EXISTS "stock_issue_lines";
DROP TABLE IF EXISTS "stock_issues";
DROP TABLE IF EXISTS "cheque_payments";
DROP TABLE IF EXISTS "payment_voucher_lines";
DROP TABLE IF EXISTS "payment_vouchers";
DROP TABLE IF EXISTS "goods_receipt_lines";
DROP TABLE IF EXISTS "goods_receipts";
DROP TABLE IF EXISTS "contractor_payment_request_lines";
DROP TABLE IF EXISTS "contractor_payment_requests";
DROP TABLE IF EXISTS "purchase_order_lines";
DROP TABLE IF EXISTS "purchase_orders";
DROP TABLE IF EXISTS "receipt_allocations";
DROP TABLE IF EXISTS "receipt_vouchers";
DROP TABLE IF EXISTS "credit_note_lines";
DROP TABLE IF EXISTS "credit_notes";
DROP TABLE IF EXISTS "billing_note_invoices";
DROP TABLE IF EXISTS "billing_notes";
DROP TABLE IF EXISTS "invoice_lines";
DROP TABLE IF EXISTS "invoices";
DROP TABLE IF EXISTS "provisional_delivery_order_lines";
DROP TABLE IF EXISTS "provisional_delivery_orders";
