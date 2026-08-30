-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN "refundId" TEXT;

-- AlterTable
ALTER TABLE "Refund"
ADD COLUMN "approvedBy" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "providerRefundId" TEXT,
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failureReason" TEXT;

-- CreateTable
CREATE TABLE "RefundDecision" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "refundPolicyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "matchedRule" TEXT,
    "serviceRefundAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "platformFeeRefundAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalRefundAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerTransaction_refundId_createdAt_idx" ON "LedgerTransaction"("refundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundDecision_refundId_key" ON "RefundDecision"("refundId");

-- CreateIndex
CREATE INDEX "RefundDecision_refundPolicyId_policyVersion_idx" ON "RefundDecision"("refundPolicyId", "policyVersion");

-- CreateIndex
CREATE INDEX "RefundDecision_outcome_decidedAt_idx" ON "RefundDecision"("outcome", "decidedAt");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundDecision" ADD CONSTRAINT "RefundDecision_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundDecision" ADD CONSTRAINT "RefundDecision_refundPolicyId_fkey" FOREIGN KEY ("refundPolicyId") REFERENCES "RefundPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
