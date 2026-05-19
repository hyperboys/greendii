-- Add first/last name fields (Thai and English) to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firstName"   TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastName"    TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firstNameEn" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastNameEn"  TEXT;
