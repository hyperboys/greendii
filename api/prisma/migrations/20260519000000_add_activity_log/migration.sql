-- Create activity_logs table for tracking all user API activity

CREATE TABLE "activity_logs" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT,
  "username"    TEXT,
  "method"      TEXT NOT NULL,
  "path"        TEXT NOT NULL,
  "statusCode"  INTEGER NOT NULL,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "durationMs"  INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- Foreign key to users (nullable, SET NULL on delete)
ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for common query patterns
CREATE INDEX "activity_logs_userId_idx"     ON "activity_logs"("userId");
CREATE INDEX "activity_logs_createdAt_idx"  ON "activity_logs"("createdAt");
CREATE INDEX "activity_logs_statusCode_idx" ON "activity_logs"("statusCode");
