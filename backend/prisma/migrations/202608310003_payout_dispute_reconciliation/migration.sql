-- F3 financial completion: payout transfers, disputes, and reconciliation.
-- Additive only. Existing payment, earning, refund, and ledger evidence is preserved.

CREATE TYPE "PayoutStatus" AS ENUM (
  'REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'
);
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'WON', 'LOST', 'WARNING_CLOSED');
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ReconciliationItemStatus" AS ENUM ('MATCHED', 'MISMATCH', 'MISSING', 'ERROR');

ALTER TYPE "LedgerEntryType" ADD VALUE 'DISPUTE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'TRANSFER_REVERSAL';

ALTER TABLE "ProfessionalProfile"
  ADD COLUMN "stripeAccountId" TEXT,
  ADD COLUMN "stripeTransfersStatus" TEXT,
  ADD COLUMN "stripeAccountUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "providerChargeId" TEXT;
ALTER TABLE "LedgerTransaction" ADD COLUMN "payoutId" TEXT, ADD COLUMN "disputeId" TEXT;

CREATE TABLE "Payout" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "earningId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "amount" DECIMAL(19,4) NOT NULL,
  "reversedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "connectedAccountId" TEXT,
  "providerTransferId" TEXT,
  "requestedBy" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "processingStartedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "processedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payout_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "Payout_reversed_amount_valid" CHECK ("reversedAmount" >= 0 AND "reversedAmount" <= "amount"),
  CONSTRAINT "Payout_currency_iso" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "Payout_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE TABLE "Dispute" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "payoutId" TEXT,
  "professionalId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "providerDisputeId" TEXT NOT NULL,
  "providerChargeId" TEXT NOT NULL,
  "providerTransferReversalId" TEXT,
  "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "providerStatus" TEXT NOT NULL,
  "reason" TEXT,
  "amount" DECIMAL(19,4) NOT NULL,
  "recoveredAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "evidenceDueBy" TIMESTAMP(3),
  "evidence" JSONB,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastProviderEventAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Dispute_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "Dispute_recovered_amount_valid" CHECK ("recoveredAmount" >= 0 AND "recoveredAmount" <= "amount"),
  CONSTRAINT "Dispute_currency_iso" CHECK (char_length("currency") = 3 AND "currency" = upper("currency"))
);

CREATE TABLE "ReconciliationRun" (
  "id" TEXT NOT NULL,
  "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "scope" TEXT NOT NULL,
  "initiatedBy" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "mismatchCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReconciliationRun_counts_nonnegative" CHECK (
    "matchedCount" >= 0 AND "mismatchCount" >= 0 AND "errorCount" >= 0
  )
);

CREATE TABLE "ReconciliationItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "bookingId" TEXT,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "ReconciliationItemStatus" NOT NULL,
  "expected" JSONB,
  "actual" JSONB,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessionalProfile_stripeAccountId_key" ON "ProfessionalProfile"("stripeAccountId");
CREATE UNIQUE INDEX "Payment_providerChargeId_key" ON "Payment"("providerChargeId");
CREATE UNIQUE INDEX "Payout_bookingId_key" ON "Payout"("bookingId");
CREATE UNIQUE INDEX "Payout_paymentId_key" ON "Payout"("paymentId");
CREATE UNIQUE INDEX "Payout_earningId_key" ON "Payout"("earningId");
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");
CREATE UNIQUE INDEX "Payout_providerTransferId_key" ON "Payout"("providerTransferId");
CREATE INDEX "Payout_professionalId_status_requestedAt_idx" ON "Payout"("professionalId", "status", "requestedAt");
CREATE INDEX "Payout_status_requestedAt_idx" ON "Payout"("status", "requestedAt");
CREATE INDEX "Payout_actionable_idx" ON "Payout"("requestedAt") WHERE "status" IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'FAILED');

CREATE UNIQUE INDEX "Dispute_idempotencyKey_key" ON "Dispute"("idempotencyKey");
CREATE UNIQUE INDEX "Dispute_providerDisputeId_key" ON "Dispute"("providerDisputeId");
CREATE UNIQUE INDEX "Dispute_providerTransferReversalId_key" ON "Dispute"("providerTransferReversalId");
CREATE INDEX "Dispute_bookingId_openedAt_idx" ON "Dispute"("bookingId", "openedAt");
CREATE INDEX "Dispute_paymentId_openedAt_idx" ON "Dispute"("paymentId", "openedAt");
CREATE INDEX "Dispute_payoutId_idx" ON "Dispute"("payoutId");
CREATE INDEX "Dispute_professionalId_status_openedAt_idx" ON "Dispute"("professionalId", "status", "openedAt");
CREATE INDEX "Dispute_status_openedAt_idx" ON "Dispute"("status", "openedAt");
CREATE INDEX "Dispute_open_idx" ON "Dispute"("openedAt") WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

CREATE INDEX "ReconciliationRun_status_startedAt_idx" ON "ReconciliationRun"("status", "startedAt");
CREATE INDEX "ReconciliationRun_startedAt_idx" ON "ReconciliationRun"("startedAt");
CREATE UNIQUE INDEX "ReconciliationItem_runId_resourceType_resourceId_category_key" ON "ReconciliationItem"("runId", "resourceType", "resourceId", "category");
CREATE INDEX "ReconciliationItem_bookingId_createdAt_idx" ON "ReconciliationItem"("bookingId", "createdAt");
CREATE INDEX "ReconciliationItem_status_createdAt_idx" ON "ReconciliationItem"("status", "createdAt");
CREATE INDEX "LedgerTransaction_payoutId_createdAt_idx" ON "LedgerTransaction"("payoutId", "createdAt");
CREATE INDEX "LedgerTransaction_disputeId_createdAt_idx" ON "LedgerTransaction"("disputeId", "createdAt");

ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "Earning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backend-only financial evidence. With no policies, anon/authenticated access
-- through Supabase data APIs fails closed; the privileged backend remains the
-- sole access path and enforces authorization plus audit logging.
ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dispute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationItem" ENABLE ROW LEVEL SECURITY;
