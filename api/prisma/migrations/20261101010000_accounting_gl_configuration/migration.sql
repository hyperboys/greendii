CREATE TABLE "accounting_gl_configuration" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,
    "mappings" JSONB NOT NULL DEFAULT '[]',
    "policy_notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "accounting_gl_configuration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_gl_configuration_month_check" CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12),
    CONSTRAINT "accounting_gl_configuration_revision_check" CHECK ("revision" >= 0)
);
