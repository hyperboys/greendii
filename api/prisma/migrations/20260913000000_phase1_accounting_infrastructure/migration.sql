// ─────────────────────────────────────────────
// PHASE 1 MIGRATION: Accounting & Infrastructure
// ─────────────────────────────────────────────

-- CreateTable: document_sequences
CREATE TABLE IF NOT EXISTS "document_sequences" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "doc_no" TEXT,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "changed_fields" JSONB,
    "performed_by_id" TEXT,
    "reason" TEXT,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex: document_sequences_docType_periodKey_prefix_key
CREATE UNIQUE INDEX IF NOT EXISTS "document_sequences_docType_periodKey_prefix_key" ON "document_sequences"("docType", "periodKey", "prefix");

-- CreateIndex: document_sequences_docType_periodKey_idx
CREATE INDEX IF NOT EXISTS "document_sequences_docType_periodKey_idx" ON "document_sequences"("docType", "periodKey");

-- CreateIndexes for audit_logs
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_doc_no_idx" ON "audit_logs"("doc_no");
CREATE INDEX IF NOT EXISTS "audit_logs_performed_by_id_idx" ON "audit_logs"("performed_by_id");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey: audit_logs -> users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_performed_by_id_fkey'
    ) THEN
        ALTER TABLE "audit_logs"
        ADD CONSTRAINT "audit_logs_performed_by_id_fkey"
        FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
