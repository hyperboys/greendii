-- AlterTable: add profile & signature fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email"        TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone"        TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department"   TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
