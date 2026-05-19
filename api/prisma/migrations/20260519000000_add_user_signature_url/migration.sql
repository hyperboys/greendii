-- Add signatureUrl field to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
