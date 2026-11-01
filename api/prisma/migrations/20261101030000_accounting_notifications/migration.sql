CREATE TABLE "accounting_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "doc_no" TEXT,
    "action" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_notifications_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "accounting_notifications_event_id_user_id_key" ON "accounting_notifications"("event_id", "user_id");
CREATE INDEX "accounting_notifications_user_id_module_read_at_created_at_idx"
  ON "accounting_notifications"("user_id", "module", "read_at", "created_at");
