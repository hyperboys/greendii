CREATE TABLE "work_order_quotations" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hand_over_job_quotations" (
    "id" TEXT NOT NULL,
    "handOverJobId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hand_over_job_quotations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_order_quotations_workOrderId_quotationId_key" ON "work_order_quotations"("workOrderId", "quotationId");
CREATE INDEX "work_order_quotations_quotationId_idx" ON "work_order_quotations"("quotationId");
CREATE UNIQUE INDEX "hand_over_job_quotations_handOverJobId_quotationId_key" ON "hand_over_job_quotations"("handOverJobId", "quotationId");
CREATE INDEX "hand_over_job_quotations_quotationId_idx" ON "hand_over_job_quotations"("quotationId");

ALTER TABLE "work_order_quotations" ADD CONSTRAINT "work_order_quotations_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_quotations" ADD CONSTRAINT "work_order_quotations_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hand_over_job_quotations" ADD CONSTRAINT "hand_over_job_quotations_handOverJobId_fkey" FOREIGN KEY ("handOverJobId") REFERENCES "hand_over_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hand_over_job_quotations" ADD CONSTRAINT "hand_over_job_quotations_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "work_order_quotations" ("id", "workOrderId", "quotationId")
SELECT md5(random()::text || clock_timestamp()::text), "id", "quotationId"
FROM "work_orders"
WHERE "quotationId" IS NOT NULL;

INSERT INTO "hand_over_job_quotations" ("id", "handOverJobId", "quotationId")
SELECT md5(random()::text || clock_timestamp()::text), "id", "quotationId"
FROM "hand_over_jobs"
WHERE "quotationId" IS NOT NULL;