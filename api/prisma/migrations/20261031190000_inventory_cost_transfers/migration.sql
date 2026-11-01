ALTER TABLE "stock_balances" ADD COLUMN "low_stock_threshold" DECIMAL(12,3);
ALTER TABLE "goods_receipt_lines" ADD COLUMN "unit_cost" DECIMAL(38,12), ADD COLUMN "cost_evidence" TEXT;
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_threshold_nonnegative" CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0);
ALTER TABLE "stock_movements"
 ADD COLUMN "cost_status" TEXT NOT NULL DEFAULT 'unvalued',
 ADD COLUMN "value_in" DECIMAL(38,12),
 ADD COLUMN "value_out" DECIMAL(38,12),
 ADD COLUMN "balance_value" DECIMAL(38,12),
 ADD COLUMN "average_cost" DECIMAL(38,12),
 ADD COLUMN "cost_provenance" JSONB;
CREATE TABLE "stock_valuations" (
 "id" TEXT PRIMARY KEY, "warehouse_id" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
 "product_id" TEXT NOT NULL REFERENCES "account_products"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'unvalued', "quantity" DECIMAL(12,3) NOT NULL,
 "total_value" DECIMAL(38,12), "last_movement_id" TEXT, "last_date" TIMESTAMPTZ(3),
 "provenance" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "stock_valuation_valid" CHECK (quantity >= 0 AND ((status = 'unvalued' AND total_value IS NULL) OR (status = 'valued' AND total_value >= 0)))
);
CREATE UNIQUE INDEX "stock_valuations_warehouse_id_product_id_key" ON "stock_valuations"("warehouse_id","product_id");
CREATE TABLE "stock_cost_initializations" (
 "id" TEXT PRIMARY KEY, "request_key" TEXT NOT NULL UNIQUE, "request_hash" TEXT NOT NULL,
 "warehouse_id" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
 "product_id" TEXT NOT NULL REFERENCES "account_products"("id") ON DELETE RESTRICT,
 "quantity" DECIMAL(12,3) NOT NULL CHECK (quantity >= 0), "total_value" DECIMAL(38,12) NOT NULL CHECK (total_value >= 0),
 "evidence" TEXT NOT NULL, "as_of" TIMESTAMPTZ(3) NOT NULL, "balance_revision" TIMESTAMPTZ(3) NOT NULL,
 "snapshot" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "revision" INTEGER NOT NULL DEFAULT 1,
 "created_by_id" TEXT NOT NULL, "approved_by_id" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "stock_cost_initializations_warehouse_id_product_id_status_idx" ON "stock_cost_initializations"("warehouse_id","product_id","status");
CREATE TABLE "stock_transfers" (
 "id" TEXT PRIMARY KEY, "transfer_no" TEXT NOT NULL UNIQUE, "request_key" TEXT NOT NULL UNIQUE, "request_hash" TEXT NOT NULL,
 "source_warehouse_id" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
 "destination_warehouse_id" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
 "transfer_date" TIMESTAMPTZ(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "revision" INTEGER NOT NULL DEFAULT 1,
 "items" JSONB NOT NULL, "snapshot" JSONB NOT NULL, "remark" TEXT, "reason" TEXT,
 "created_by_id" TEXT NOT NULL, "approved_by_id" TEXT,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "stock_transfer_distinct_warehouses" CHECK ("source_warehouse_id" <> "destination_warehouse_id")
);
CREATE INDEX "stock_transfers_status_transfer_date_idx" ON "stock_transfers"("status","transfer_date");
