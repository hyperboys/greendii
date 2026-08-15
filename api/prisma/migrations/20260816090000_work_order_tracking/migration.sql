ALTER TABLE "work_orders"
  ADD COLUMN "due_date" TIMESTAMPTZ(3),
  ADD COLUMN "completed_at" TIMESTAMPTZ(3),
  ADD COLUMN "po_requirement" TEXT NOT NULL DEFAULT 'required',
  ADD COLUMN "no_po_reason" TEXT,
  ADD COLUMN "no_po_remark" TEXT,
  ADD COLUMN "issue_status" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "issue_type" TEXT,
  ADD COLUMN "issue_detail" TEXT,
  ADD COLUMN "issue_owner" TEXT,
  ADD COLUMN "issue_expected_at" TIMESTAMPTZ(3),
  ADD COLUMN "issue_blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "issue_resolved_at" TIMESTAMPTZ(3);

CREATE INDEX "work_orders_po_requirement_status_idx"
  ON "work_orders" ("po_requirement", "status", "is_closed");

CREATE INDEX "work_orders_due_date_idx"
  ON "work_orders" ("due_date");

CREATE TABLE "workorder_issue_logs" (
  "id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "issue_type" TEXT,
  "detail" TEXT,
  "owner" TEXT,
  "expected_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workorder_issue_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workorder_issue_logs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workorder_issue_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "workorder_issue_logs_work_order_id_created_at_idx"
  ON "workorder_issue_logs" ("work_order_id", "created_at");