-- F4 Admin Foundation: revocable browser sessions and four-eyes role changes.
-- Additive only. Existing mobile JWTs and legacy RBAC assignments remain compatible.

CREATE TYPE "AdminSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "AdminRoleChangeAction" AS ENUM ('GRANT', 'REVOKE');
CREATE TYPE "AdminRoleChangeRequestStatus" AS ENUM ('REQUESTED', 'EXECUTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "status" "AdminSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "userAgentHash" TEXT,
    "ipAddressHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRoleChangeRequest" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" "AdminRoleChangeAction" NOT NULL,
    "status" "AdminRoleChangeRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminRoleChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_refreshTokenHash_key" ON "AdminSession"("refreshTokenHash");
CREATE INDEX "AdminSession_userId_status_expiresAt_idx" ON "AdminSession"("userId", "status", "expiresAt");
CREATE INDEX "AdminSession_status_expiresAt_idx" ON "AdminSession"("status", "expiresAt");

CREATE UNIQUE INDEX "AdminRoleChangeRequest_idempotencyKey_key" ON "AdminRoleChangeRequest"("idempotencyKey");
CREATE INDEX "AdminRoleChangeRequest_status_requestedAt_idx" ON "AdminRoleChangeRequest"("status", "requestedAt");
CREATE INDEX "AdminRoleChangeRequest_targetUserId_status_requestedAt_idx" ON "AdminRoleChangeRequest"("targetUserId", "status", "requestedAt");
CREATE INDEX "AdminRoleChangeRequest_roleId_status_idx" ON "AdminRoleChangeRequest"("roleId", "status");
CREATE UNIQUE INDEX "AdminRoleChangeRequest_pending_change_key"
  ON "AdminRoleChangeRequest"("targetUserId", "roleId", "action")
  WHERE "status" = 'REQUESTED';

ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminRoleChangeRequest"
  ADD CONSTRAINT "AdminRoleChangeRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminRoleChangeRequest"
  ADD CONSTRAINT "AdminRoleChangeRequest_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminRoleChangeRequest"
  ADD CONSTRAINT "AdminRoleChangeRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminRoleChangeRequest"
  ADD CONSTRAINT "AdminRoleChangeRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdminSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminRoleChangeRequest" ENABLE ROW LEVEL SECURITY;
