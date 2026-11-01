-- Additive only: no legacy backfill, no issued-cheque changes.
ALTER TABLE "receipt_vouchers"
  ADD COLUMN "received_cheque_state" TEXT,
  ADD COLUMN "cheque_deposited_at" TIMESTAMPTZ(3),
  ADD COLUMN "cheque_cleared_at" TIMESTAMPTZ(3),
  ADD COLUMN "cheque_dishonoured_at" TIMESTAMPTZ(3),
  ADD COLUMN "cheque_deposit_bank" TEXT,
  ADD COLUMN "cheque_deposit_ref" TEXT,
  ADD COLUMN "cheque_dishonour_reason" TEXT;
ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "received_cheque_state_check"
  CHECK ("received_cheque_state" IS NULL OR
    ("payment_method" = 'cheque' AND "lifecycle_version" = 1 AND
     "received_cheque_state" IN ('received', 'deposited', 'cleared', 'dishonoured', 'cancelled')));
CREATE INDEX "receipt_vouchers_received_cheque_idx"
  ON "receipt_vouchers" ("received_cheque_state", "cheque_date");
