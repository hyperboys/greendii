BEGIN;

CREATE TABLE "accounting_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "accounting_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_roles_name_key" ON "accounting_roles"("name");

CREATE TABLE "accounting_user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "accounting_user_roles_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "accounting_user_roles_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accounting_user_roles_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "accounting_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "accounting_user_roles_roleId_idx" ON "accounting_user_roles"("roleId");

COMMIT;
