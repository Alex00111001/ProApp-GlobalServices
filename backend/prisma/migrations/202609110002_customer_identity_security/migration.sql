-- Customer identity security foundation. Additive and safe for existing legacy JWTs.
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE TYPE "CustomerSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "CustomerRefreshTokenStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED');
CREATE TYPE "AccountActionTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "AccountActionTokenStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED');

CREATE TABLE "CustomerSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "CustomerSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "userAgentHash" TEXT,
  "ipAddressHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerRefreshToken" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "CustomerRefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountActionToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AccountActionTokenType" NOT NULL,
  "status" "AccountActionTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "RateLimitBucket_count_ck" CHECK ("count" >= 0)
);

CREATE INDEX "CustomerSession_userId_status_expiresAt_idx" ON "CustomerSession"("userId", "status", "expiresAt");
CREATE INDEX "CustomerSession_status_expiresAt_idx" ON "CustomerSession"("status", "expiresAt");
CREATE UNIQUE INDEX "CustomerRefreshToken_tokenHash_key" ON "CustomerRefreshToken"("tokenHash");
CREATE INDEX "CustomerRefreshToken_sessionId_status_expiresAt_idx" ON "CustomerRefreshToken"("sessionId", "status", "expiresAt");
CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE INDEX "AccountActionToken_userId_type_status_idx" ON "AccountActionToken"("userId", "type", "status");
CREATE INDEX "AccountActionToken_type_status_expiresAt_idx" ON "AccountActionToken"("type", "status", "expiresAt");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerRefreshToken" ADD CONSTRAINT "CustomerRefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CustomerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSession" ENABLE ROW LEVEL SECURITY; ALTER TABLE "CustomerSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CustomerRefreshToken" ENABLE ROW LEVEL SECURITY; ALTER TABLE "CustomerRefreshToken" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AccountActionToken" ENABLE ROW LEVEL SECURITY; ALTER TABLE "AccountActionToken" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY; ALTER TABLE "RateLimitBucket" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "CustomerSession", "CustomerRefreshToken", "AccountActionToken", "RateLimitBucket" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "CustomerSession", "CustomerRefreshToken", "AccountActionToken", "RateLimitBucket" FROM authenticated;
  END IF;
END $$;
