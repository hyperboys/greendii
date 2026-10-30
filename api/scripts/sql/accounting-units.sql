-- Accounting-only suggestions. Existing product/document unit snapshots are unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS "account_units" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "account_units" ("id", "code", "name") VALUES
  ('account-unit-01', 'U001', 'Lot'),
  ('account-unit-02', 'U002', 'Set'),
  ('account-unit-03', 'U003', 'เมตร'),
  ('account-unit-04', 'U004', 'ตาราง'),
  ('account-unit-05', 'U005', 'Pcs'),
  ('account-unit-06', 'U006', 'Gallon'),
  ('account-unit-07', 'U007', 'Pair'),
  ('account-unit-08', 'U008', 'Mat'),
  ('account-unit-09', 'U009', 'EA'),
  ('account-unit-10', 'U010', 'AU'),
  ('account-unit-11', 'U011', 'Bag'),
  ('account-unit-12', 'U012', 'Unit'),
  ('account-unit-13', 'U013', 'Job'),
  ('account-unit-14', 'U014', 'Sheet'),
  ('account-unit-15', 'U015', 'Box'),
  ('account-unit-16', 'U016', 'KG'),
  ('account-unit-17', 'U017', 'ETC'),
  ('account-unit-18', 'U018', 'ตัน'),
  ('account-unit-19', 'U019', 'Roll')
ON CONFLICT DO NOTHING;
COMMIT;
