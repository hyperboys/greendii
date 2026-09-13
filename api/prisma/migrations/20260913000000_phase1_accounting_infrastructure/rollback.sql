-- Rollback Phase 1 Infrastructure Tables
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_performed_by_id_fkey";
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "document_sequences";
