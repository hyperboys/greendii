-- Migration: remove sales2 role, migrate to sales
-- Step 1: update all users with sales2 → sales
UPDATE users SET role = 'sales' WHERE role = 'sales2';

-- Step 2: recreate enum without sales2 (PostgreSQL requires this approach)
CREATE TYPE "UserRole_new" AS ENUM (
  'admin', 'sales', 'sale_mgr', 'admin_mgr',
  'project_mgr', 'director', 'procurement', 'factory'
);

ALTER TABLE users
  ALTER COLUMN role TYPE "UserRole_new"
  USING role::text::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
