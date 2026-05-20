-- Add specialDiscount column to purchase_requests table
ALTER TABLE "purchase_requests" ADD COLUMN "specialDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
