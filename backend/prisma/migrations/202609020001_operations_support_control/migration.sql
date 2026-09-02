CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCOUNT', 'BOOKING', 'PAYMENT', 'PROFESSIONAL', 'SAFETY', 'OTHER');

CREATE TABLE "SupportCase" (
  "id" TEXT NOT NULL,
  "caseKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "SupportCaseCategory" NOT NULL,
  "priority" "SupportCasePriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "requesterUserId" TEXT,
  "bookingId" TEXT,
  "assignedToId" TEXT,
  "createdById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportCaseComment" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportCaseComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportCaseEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" "SupportCaseStatus",
  "toStatus" "SupportCaseStatus",
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportCaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportCase_caseKey_key" ON "SupportCase"("caseKey");
CREATE INDEX "SupportCase_status_priority_updatedAt_idx" ON "SupportCase"("status", "priority", "updatedAt");
CREATE INDEX "SupportCase_requesterUserId_createdAt_idx" ON "SupportCase"("requesterUserId", "createdAt");
CREATE INDEX "SupportCase_bookingId_createdAt_idx" ON "SupportCase"("bookingId", "createdAt");
CREATE INDEX "SupportCase_assignedToId_status_updatedAt_idx" ON "SupportCase"("assignedToId", "status", "updatedAt");
CREATE INDEX "SupportCaseComment_caseId_createdAt_idx" ON "SupportCaseComment"("caseId", "createdAt");
CREATE INDEX "SupportCaseComment_authorId_createdAt_idx" ON "SupportCaseComment"("authorId", "createdAt");
CREATE INDEX "SupportCaseEvent_caseId_createdAt_idx" ON "SupportCaseEvent"("caseId", "createdAt");
CREATE INDEX "SupportCaseEvent_actorId_createdAt_idx" ON "SupportCaseEvent"("actorId", "createdAt");

ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCaseComment" ADD CONSTRAINT "SupportCaseComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportCaseComment" ADD CONSTRAINT "SupportCaseComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCaseEvent" ADD CONSTRAINT "SupportCaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportCaseEvent" ADD CONSTRAINT "SupportCaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportCase" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportCaseComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportCaseComment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportCaseEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportCaseEvent" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM authenticated;
  END IF;
END
$$;
REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM PUBLIC;
