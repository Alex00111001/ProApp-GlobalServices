-- CreateEnum
CREATE TYPE "ReferralProgramStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReferralActorType" AS ENUM ('CLIENT', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "ReferralCodeStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('CREATED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReferralConversionStatus" AS ENUM ('QUALIFIED', 'CONVERTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('ACCOUNT_CREDIT', 'NON_MONETARY');

-- CreateEnum
CREATE TYPE "ReferralRewardSide" AS ENUM ('REFERRER', 'REFERRED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'APPROVED', 'HELD', 'FULFILLED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReferralRiskStatus" AS ENUM ('CLEAR', 'ATTENTION', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AutomationDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('TRIGGERED', 'SKIPPED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "AutomationStepExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXHAUSTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ReferralProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "featureFlagKey" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgramVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "referrerActorType" "ReferralActorType" NOT NULL,
    "referredActorType" "ReferralActorType" NOT NULL,
    "enabledMarkets" TEXT[],
    "qualifyingEventType" TEXT NOT NULL,
    "waitingPeriodHours" INTEGER NOT NULL DEFAULT 0,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 0,
    "maxCodesPerOwner" INTEGER NOT NULL DEFAULT 1,
    "maxUsesPerCode" INTEGER NOT NULL DEFAULT 100,
    "maxReferralsPerOwner" INTEGER NOT NULL DEFAULT 100,
    "rewardType" "ReferralRewardType" NOT NULL,
    "referrerRewardAmount" DECIMAL(18,2),
    "referredRewardAmount" DECIMAL(18,2),
    "currency" TEXT,
    "nonMonetaryBenefitKey" TEXT,
    "configurationDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerType" "ReferralActorType" NOT NULL,
    "status" "ReferralCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxUses" INTEGER NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'CREATED',
    "riskStatus" "ReferralRiskStatus" NOT NULL DEFAULT 'CLEAR',
    "rejectionCode" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralConversion" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "sourceOutboxEventId" TEXT NOT NULL,
    "sourceConversionId" TEXT,
    "eventType" TEXT NOT NULL,
    "status" "ReferralConversionStatus" NOT NULL DEFAULT 'QUALIFIED',
    "evidenceDigest" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "beneficiaryUserId" TEXT NOT NULL,
    "beneficiarySide" "ReferralRewardSide" NOT NULL,
    "rewardType" "ReferralRewardType" NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "benefitKey" TEXT,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceDigest" TEXT NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "heldAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "financialIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralRiskAssessment" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "outcome" "ReferralRiskStatus" NOT NULL,
    "signals" JSONB NOT NULL,
    "evidenceDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "featureFlagKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "conditionTree" JSONB,
    "configurationDigest" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTrigger" (
    "id" TEXT NOT NULL,
    "automationVersionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AutomationTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationAction" (
    "id" TEXT NOT NULL,
    "automationVersionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "initialBackoffSeconds" INTEGER NOT NULL DEFAULT 30,
    "maxBackoffSeconds" INTEGER NOT NULL DEFAULT 3600,

    CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEventDelivery" (
    "id" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "AutomationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationEventDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "automationVersionId" TEXT NOT NULL,
    "triggerEventId" TEXT NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'TRIGGERED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "firstFailureAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStepExecution" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AutomationStepExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "firstFailureAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resultReference" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationStepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProgram_key_key" ON "ReferralProgram"("key");

-- CreateIndex
CREATE INDEX "ReferralProgram_status_effectiveAt_endsAt_idx" ON "ReferralProgram"("status", "effectiveAt", "endsAt");

-- CreateIndex
CREATE INDEX "ReferralProgram_createdById_idx" ON "ReferralProgram"("createdById");

-- CreateIndex
CREATE INDEX "ReferralProgramVersion_qualifyingEventType_idx" ON "ReferralProgramVersion"("qualifyingEventType");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProgramVersion_programId_version_key" ON "ReferralProgramVersion"("programId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_idempotencyKey_key" ON "ReferralCode"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReferralCode_programId_ownerUserId_status_idx" ON "ReferralCode"("programId", "ownerUserId", "status");

-- CreateIndex
CREATE INDEX "ReferralCode_status_expiresAt_idx" ON "ReferralCode"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_idempotencyKey_key" ON "Referral"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Referral_referrerUserId_status_createdAt_idx" ON "Referral"("referrerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_referredUserId_status_createdAt_idx" ON "Referral"("referredUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_programId_status_createdAt_idx" ON "Referral"("programId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_correlationId_idx" ON "Referral"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_programId_referredUserId_key" ON "Referral"("programId", "referredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralConversion_sourceOutboxEventId_key" ON "ReferralConversion"("sourceOutboxEventId");

-- CreateIndex
CREATE INDEX "ReferralConversion_sourceConversionId_idx" ON "ReferralConversion"("sourceConversionId");

-- CreateIndex
CREATE INDEX "ReferralConversion_status_occurredAt_idx" ON "ReferralConversion"("status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralConversion_referralId_eventType_key" ON "ReferralConversion"("referralId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_idempotencyKey_key" ON "ReferralReward"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_financialIntentId_key" ON "ReferralReward"("financialIntentId");

-- CreateIndex
CREATE INDEX "ReferralReward_beneficiaryUserId_status_createdAt_idx" ON "ReferralReward"("beneficiaryUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralReward_status_eligibleAt_idx" ON "ReferralReward"("status", "eligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referralId_beneficiarySide_key" ON "ReferralReward"("referralId", "beneficiarySide");

-- CreateIndex
CREATE INDEX "ReferralRiskAssessment_referralId_createdAt_idx" ON "ReferralRiskAssessment"("referralId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralRiskAssessment_outcome_createdAt_idx" ON "ReferralRiskAssessment"("outcome", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationDefinition_key_key" ON "AutomationDefinition"("key");

-- CreateIndex
CREATE INDEX "AutomationDefinition_status_updatedAt_idx" ON "AutomationDefinition"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AutomationDefinition_createdById_idx" ON "AutomationDefinition"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationVersion_definitionId_version_key" ON "AutomationVersion"("definitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationTrigger_automationVersionId_key" ON "AutomationTrigger"("automationVersionId");

-- CreateIndex
CREATE INDEX "AutomationTrigger_eventType_idx" ON "AutomationTrigger"("eventType");

-- CreateIndex
CREATE INDEX "AutomationAction_actionType_idx" ON "AutomationAction"("actionType");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationAction_automationVersionId_position_key" ON "AutomationAction"("automationVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEventDelivery_sourceEventId_key" ON "AutomationEventDelivery"("sourceEventId");

-- CreateIndex
CREATE INDEX "AutomationEventDelivery_status_availableAt_idx" ON "AutomationEventDelivery"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AutomationEventDelivery_eventType_createdAt_idx" ON "AutomationEventDelivery"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_status_nextAttemptAt_idx" ON "AutomationExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_correlationId_idx" ON "AutomationExecution"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_automationVersionId_triggerEventId_key" ON "AutomationExecution"("automationVersionId", "triggerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStepExecution_idempotencyKey_key" ON "AutomationStepExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationStepExecution_status_nextAttemptAt_idx" ON "AutomationStepExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStepExecution_executionId_actionId_key" ON "AutomationStepExecution"("executionId", "actionId");

-- AddForeignKey
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramVersion" ADD CONSTRAINT "ReferralProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ReferralProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralConversion" ADD CONSTRAINT "ReferralConversion_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralConversion" ADD CONSTRAINT "ReferralConversion_sourceOutboxEventId_fkey" FOREIGN KEY ("sourceOutboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralConversion" ADD CONSTRAINT "ReferralConversion_sourceConversionId_fkey" FOREIGN KEY ("sourceConversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ReferralProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRiskAssessment" ADD CONSTRAINT "ReferralRiskAssessment_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationDefinition" ADD CONSTRAINT "AutomationDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AutomationDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTrigger" ADD CONSTRAINT "AutomationTrigger_automationVersionId_fkey" FOREIGN KEY ("automationVersionId") REFERENCES "AutomationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_automationVersionId_fkey" FOREIGN KEY ("automationVersionId") REFERENCES "AutomationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationEventDelivery" ADD CONSTRAINT "AutomationEventDelivery_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationVersionId_fkey" FOREIGN KEY ("automationVersionId") REFERENCES "AutomationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_triggerEventId_fkey" FOREIGN KEY ("triggerEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStepExecution" ADD CONSTRAINT "AutomationStepExecution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStepExecution" ADD CONSTRAINT "AutomationStepExecution_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutomationAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F8 domain invariants enforced below the service layer.
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_version_check"
  CHECK ("currentVersion" > 0 AND "rowVersion" > 0 AND ("endsAt" IS NULL OR "effectiveAt" IS NULL OR "endsAt" > "effectiveAt"));
ALTER TABLE "ReferralProgramVersion" ADD CONSTRAINT "ReferralProgramVersion_limits_check"
  CHECK ("version" > 0 AND cardinality("enabledMarkets") BETWEEN 1 AND 100
    AND "waitingPeriodHours" BETWEEN 0 AND 8760 AND "cancellationWindowHours" BETWEEN 0 AND 8760
    AND "maxCodesPerOwner" BETWEEN 1 AND 20 AND "maxUsesPerCode" BETWEEN 1 AND 100000
    AND "maxReferralsPerOwner" BETWEEN 1 AND 100000);
ALTER TABLE "ReferralProgramVersion" ADD CONSTRAINT "ReferralProgramVersion_reward_check"
  CHECK (("rewardType" = 'ACCOUNT_CREDIT' AND "currency" ~ '^[A-Z]{3}$' AND "nonMonetaryBenefitKey" IS NULL
      AND COALESCE("referrerRewardAmount", 0) >= 0 AND COALESCE("referredRewardAmount", 0) >= 0
      AND (COALESCE("referrerRewardAmount", 0) > 0 OR COALESCE("referredRewardAmount", 0) > 0))
    OR ("rewardType" = 'NON_MONETARY' AND "currency" IS NULL AND "referrerRewardAmount" IS NULL
      AND "referredRewardAmount" IS NULL AND "nonMonetaryBenefitKey" ~ '^[a-z0-9][a-z0-9._-]{1,79}$'));
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_shape_check"
  CHECK ("code" ~ '^REF_[A-Z0-9]{24,64}$' AND "maxUses" > 0 AND "useCount" BETWEEN 0 AND "maxUses"
    AND (("status" = 'REVOKED' AND "revokedAt" IS NOT NULL) OR "status" <> 'REVOKED'));
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_no_self_referral_check" CHECK ("referrerUserId" <> "referredUserId");
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_value_check"
  CHECK (("rewardType" = 'ACCOUNT_CREDIT' AND "amount" > 0 AND "currency" ~ '^[A-Z]{3}$' AND "benefitKey" IS NULL)
    OR ("rewardType" = 'NON_MONETARY' AND "amount" IS NULL AND "currency" IS NULL AND "benefitKey" IS NOT NULL));
ALTER TABLE "AutomationDefinition" ADD CONSTRAINT "AutomationDefinition_version_check" CHECK ("currentVersion" > 0 AND "rowVersion" > 0);
ALTER TABLE "AutomationTrigger" ADD CONSTRAINT "AutomationTrigger_schema_check"
  CHECK ("schemaVersion" BETWEEN 1 AND 100 AND "eventType" ~ '^[a-z][a-z0-9_.-]{2,127}$');
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_bounds_check"
  CHECK ("position" BETWEEN 0 AND 99 AND "delaySeconds" BETWEEN 0 AND 2592000
    AND "maxAttempts" BETWEEN 1 AND 10 AND "initialBackoffSeconds" BETWEEN 1 AND 86400
    AND "maxBackoffSeconds" BETWEEN "initialBackoffSeconds" AND 604800);
ALTER TABLE "AutomationEventDelivery" ADD CONSTRAINT "AutomationEventDelivery_error_check"
  CHECK ("attempts" BETWEEN 0 AND 20 AND ("lastError" IS NULL OR char_length("lastError") <= 1024));
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_error_check"
  CHECK ("attemptCount" BETWEEN 0 AND 100 AND ("lastError" IS NULL OR char_length("lastError") <= 1024));
ALTER TABLE "AutomationStepExecution" ADD CONSTRAINT "AutomationStepExecution_error_check"
  CHECK ("attempts" BETWEEN 0 AND 10 AND ("lastError" IS NULL OR char_length("lastError") <= 1024));

CREATE UNIQUE INDEX "ReferralCode_one_active_owner_program_idx"
  ON "ReferralCode" ("programId", "ownerUserId") WHERE "status" = 'ACTIVE';

-- Transactional fan-out: automation receives an independent durable delivery
-- without competing for the canonical OutboxEvent consumer state.
CREATE OR REPLACE FUNCTION public.enqueue_automation_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO "AutomationEventDelivery" (
    "id", "sourceEventId", "eventType", "status", "attempts", "availableAt", "createdAt"
  ) VALUES (
    NEW."id", NEW."id", NEW."eventType", 'PENDING', 0, NEW."availableAt", NEW."createdAt"
  ) ON CONFLICT ("sourceEventId") DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "OutboxEvent_automation_delivery"
AFTER INSERT ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION public.enqueue_automation_delivery();

-- Supabase API roles are fail-closed; access is through the backend role only.
ALTER TABLE "ReferralProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralProgramVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralConversion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralReward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralRiskAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationTrigger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationEventDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationStepExecution" ENABLE ROW LEVEL SECURITY;

DO $block$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I, %I, %I, %I, %I, %I, %I, %I, %I, %I, %I, %I, %I, %I FROM %I',
        'ReferralProgram', 'ReferralProgramVersion', 'ReferralCode', 'Referral', 'ReferralConversion',
        'ReferralReward', 'ReferralRiskAssessment', 'AutomationDefinition', 'AutomationVersion',
        'AutomationTrigger', 'AutomationAction', 'AutomationEventDelivery', 'AutomationExecution',
        'AutomationStepExecution', role_name);
    END IF;
  END LOOP;
END;
$block$;
