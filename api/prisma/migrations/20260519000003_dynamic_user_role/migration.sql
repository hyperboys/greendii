-- Migration: Convert UserRole enum to TEXT for dynamic role support
-- This allows adding new roles from the Admin UI without schema changes

-- Step 1: Change the column type from enum to TEXT
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::text;

-- Step 2: Remove the default (Prisma will manage this via the schema)
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales';

-- Step 3: Drop the old enum type (no longer referenced)
DROP TYPE IF EXISTS "UserRole";
