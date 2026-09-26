ALTER TABLE "purchase_requests"
  ADD COLUMN "previousPurchaseRequestId" TEXT,
  ADD COLUMN "revisionReason" TEXT;

CREATE INDEX "purchase_requests_rootPurchaseRequestId_revisionNo_idx"
  ON "purchase_requests"("rootPurchaseRequestId", "revisionNo");

UPDATE "purchase_requests" AS current_pr
SET "previousPurchaseRequestId" = previous_pr.id
FROM "purchase_requests" AS previous_pr
WHERE current_pr."revisionNo" = 1
  AND current_pr."rootPurchaseRequestId" IS NOT NULL
  AND previous_pr.id = current_pr."rootPurchaseRequestId";

UPDATE "purchase_requests" AS current_pr
SET "previousPurchaseRequestId" = previous_pr.id
FROM "purchase_requests" AS previous_pr
WHERE current_pr."revisionNo" > 1
  AND current_pr."rootPurchaseRequestId" IS NOT NULL
  AND previous_pr."rootPurchaseRequestId" = current_pr."rootPurchaseRequestId"
  AND previous_pr."revisionNo" = current_pr."revisionNo" - 1;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_previousPurchaseRequestId_fkey"
  FOREIGN KEY ("previousPurchaseRequestId")
  REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchase_requests_previousPurchaseRequestId_idx"
  ON "purchase_requests"("previousPurchaseRequestId");

ALTER TABLE "purchase_request_items"
  ADD COLUMN "revisionKey" TEXT;

CREATE UNIQUE INDEX "purchase_request_items_purchaseRequestId_revisionKey_key"
  ON "purchase_request_items"("purchaseRequestId", "revisionKey");