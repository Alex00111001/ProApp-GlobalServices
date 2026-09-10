-- CreateEnum
CREATE TYPE "DefinitionLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SupplyDemandMetricKind" AS ENUM ('SUPPLY', 'DEMAND', 'BALANCE', 'GUARDRAIL');

-- CreateEnum
CREATE TYPE "SupplyDemandWindow" AS ENUM ('HOUR', 'DAY', 'SEVEN_DAYS', 'THIRTY_DAYS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SupplyDemandDataQuality" AS ENUM ('COMPLETE', 'PARTIAL', 'STALE', 'INSUFFICIENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketReadinessOutcome" AS ENUM ('NOT_READY', 'CONDITIONALLY_READY', 'READY');

-- CreateEnum
CREATE TYPE "ExpansionCandidateType" AS ENUM ('MARKET', 'GEOGRAPHY', 'SERVICE', 'COVERAGE_INCREASE', 'COVERAGE_REDUCTION');

-- CreateEnum
CREATE TYPE "ExpansionCandidateStatus" AS ENUM ('IDENTIFIED', 'UNDER_REVIEW', 'REVIEWED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExpansionRecommendation" AS ENUM ('DO_NOT_PROCEED', 'INVESTIGATE', 'PREPARE', 'RECOMMEND_READY');

-- CreateEnum
CREATE TYPE "RecommendationReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AIProviderStatus" AS ENUM ('DISABLED', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AIDataClass" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "AIRiskClass" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "AIOperationKind" AS ENUM ('SUMMARIZE_OPERATIONAL_INCIDENT', 'CLASSIFY_OPERATIONAL_SIGNAL', 'EXPLAIN_MARKET_READINESS', 'SUGGEST_EXPANSION_HYPOTHESES', 'SUMMARIZE_SUPPLY_DEMAND_ANOMALY', 'DRAFT_INTERNAL_CONTENT', 'RECOMMEND_INVESTIGATION_STEPS');

-- CreateEnum
CREATE TYPE "AIOperationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AIExecutionStatus" AS ENUM ('PENDING', 'ROUTING', 'RUNNING', 'AWAITING_APPROVAL', 'SUCCEEDED', 'SKIPPED', 'FAILED', 'EXHAUSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIOutputValidationStatus" AS ENUM ('VALID', 'INVALID_SCHEMA', 'REJECTED_SAFETY');

-- CreateEnum
CREATE TYPE "AIEvaluationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AIApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SupplyDemandMetricDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DefinitionLifecycle" NOT NULL DEFAULT 'DRAFT',
    "kind" "SupplyDemandMetricKind" NOT NULL,
    "unit" TEXT NOT NULL,
    "eventSources" TEXT[],
    "numeratorDefinition" JSONB NOT NULL,
    "denominatorDefinition" JSONB,
    "deduplication" JSONB NOT NULL,
    "dimensions" TEXT[],
    "supportedWindows" "SupplyDemandWindow"[],
    "timezonePolicy" JSONB NOT NULL,
    "lateArrivalMinutes" INTEGER NOT NULL DEFAULT 60,
    "formulaVersion" TEXT NOT NULL,
    "configurationDigest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyDemandMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyDemandObservation" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "divisionId" TEXT,
    "serviceId" TEXT,
    "dimensionKey" TEXT NOT NULL,
    "window" "SupplyDemandWindow" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "eventWatermark" TIMESTAMP(3),
    "numerator" DECIMAL(20,6) NOT NULL,
    "denominator" DECIMAL(20,6),
    "value" DECIMAL(20,6) NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "dataQuality" "SupplyDemandDataQuality" NOT NULL,
    "qualityReasons" TEXT[],
    "evidence" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyDemandObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyDemandSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotKey" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "divisionId" TEXT,
    "serviceId" TEXT,
    "window" "SupplyDemandWindow" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "eventWatermark" TIMESTAMP(3),
    "status" "SupplyDemandDataQuality" NOT NULL,
    "components" JSONB NOT NULL,
    "balance" JSONB NOT NULL,
    "anomalies" JSONB NOT NULL,
    "missingEvidence" TEXT[],
    "algorithmVersion" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyDemandSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketReadinessPolicy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "marketId" TEXT,
    "status" "DefinitionLifecycle" NOT NULL DEFAULT 'DRAFT',
    "requiredDimensions" TEXT[],
    "thresholds" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "dataQualityPolicy" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "configurationDigest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReadinessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketReadinessEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationKey" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "outcome" "MarketReadinessOutcome" NOT NULL,
    "componentResults" JSONB NOT NULL,
    "blockers" TEXT[],
    "missingEvidence" TEXT[],
    "evidenceReferences" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReadinessEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpansionCandidate" (
    "id" TEXT NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "type" "ExpansionCandidateType" NOT NULL,
    "status" "ExpansionCandidateStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "marketId" TEXT NOT NULL,
    "divisionId" TEXT,
    "serviceId" TEXT,
    "hypothesis" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpansionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpansionEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationKey" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "readinessEvaluationId" TEXT,
    "recommendation" "ExpansionRecommendation" NOT NULL,
    "confidenceBps" INTEGER NOT NULL,
    "reasons" TEXT[],
    "blockers" TEXT[],
    "missingEvidence" TEXT[],
    "guardrails" JSONB NOT NULL,
    "evidenceReferences" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "reviewStatus" "RecommendationReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpansionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRecommendation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RecommendationReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "snapshotId" TEXT,
    "readinessEvaluationId" TEXT,
    "expansionEvaluationId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasons" TEXT[],
    "blockers" TEXT[],
    "evidenceDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "adapterType" TEXT NOT NULL,
    "status" "AIProviderStatus" NOT NULL DEFAULT 'DISABLED',
    "capabilities" TEXT[],
    "purposeAllowlist" TEXT[],
    "region" TEXT,
    "maximumDataClass" "AIDataClass" NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "maxConcurrency" INTEGER NOT NULL,
    "requestsPerMinute" INTEGER NOT NULL,
    "circuitBreakerPolicy" JSONB NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelPolicy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DefinitionLifecycle" NOT NULL DEFAULT 'DRAFT',
    "providerId" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "purposeAllowlist" TEXT[],
    "operationAllowlist" "AIOperationKind"[],
    "maximumDataClass" "AIDataClass" NOT NULL,
    "marketAllowlist" TEXT[],
    "localeAllowlist" TEXT[],
    "maxInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "maxCostMicros" BIGINT NOT NULL,
    "routingPriority" INTEGER NOT NULL,
    "constraints" JSONB NOT NULL,
    "configurationDigest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPromptTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "riskClass" "AIRiskClass" NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPromptVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DefinitionLifecycle" NOT NULL DEFAULT 'DRAFT',
    "systemPolicy" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "requiredVariables" TEXT[],
    "outputSchema" JSONB NOT NULL,
    "providerConstraints" JSONB NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOperationDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "AIOperationKind" NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "AIOperationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIOperationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOperationVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "riskClass" "AIRiskClass" NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "allowedInputFields" TEXT[],
    "allowedToolKeys" TEXT[],
    "requiredCapability" TEXT NOT NULL,
    "maximumDataClass" "AIDataClass" NOT NULL,
    "maxInputBytes" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "initialBackoffSeconds" INTEGER NOT NULL DEFAULT 30,
    "maxBackoffSeconds" INTEGER NOT NULL DEFAULT 900,
    "maxCostMicros" BIGINT NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "evaluationRequired" BOOLEAN NOT NULL DEFAULT true,
    "configurationDigest" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIOperationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOperationExecution" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationVersionId" TEXT NOT NULL,
    "providerId" TEXT,
    "modelPolicyId" TEXT,
    "marketId" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "AIExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "dataClass" "AIDataClass" NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "safeInput" JSONB NOT NULL,
    "routingEvidence" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "firstFailureAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "safeError" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIOperationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInputReference" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "dataClass" "AIDataClass" NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "safeMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInputReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIOutputArtifact" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "validationStatus" "AIOutputValidationStatus" NOT NULL,
    "safetyEvidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIOutputArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationKey" TEXT NOT NULL,
    "operationVersionId" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "datasetDigest" TEXT NOT NULL,
    "modelPolicyKey" TEXT NOT NULL,
    "status" "AIEvaluationStatus" NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "schemaPassRateBps" INTEGER NOT NULL,
    "safetyPassRateBps" INTEGER NOT NULL,
    "qualityScoreBps" INTEGER NOT NULL,
    "p95LatencyMs" INTEGER NOT NULL,
    "estimatedCostMicros" BIGINT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIApproval" (
    "id" TEXT NOT NULL,
    "outputArtifactId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "AIApprovalDecision" NOT NULL,
    "artifactDigest" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICostRecord" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelPolicyId" TEXT NOT NULL,
    "marketId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostMicros" BIGINT NOT NULL,
    "actualCostMicros" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplyDemandMetricDefinition_status_kind_effectiveAt_idx" ON "SupplyDemandMetricDefinition"("status", "kind", "effectiveAt");

-- CreateIndex
CREATE INDEX "SupplyDemandMetricDefinition_configurationDigest_idx" ON "SupplyDemandMetricDefinition"("configurationDigest");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyDemandMetricDefinition_key_version_key" ON "SupplyDemandMetricDefinition"("key", "version");

-- CreateIndex
CREATE INDEX "SupplyDemandObservation_marketId_windowStart_windowEnd_idx" ON "SupplyDemandObservation"("marketId", "windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "SupplyDemandObservation_marketId_divisionId_serviceId_windo_idx" ON "SupplyDemandObservation"("marketId", "divisionId", "serviceId", "windowEnd");

-- CreateIndex
CREATE INDEX "SupplyDemandObservation_dataQuality_processedAt_idx" ON "SupplyDemandObservation"("dataQuality", "processedAt");

-- CreateIndex
CREATE INDEX "SupplyDemandObservation_correlationId_idx" ON "SupplyDemandObservation"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyDemandObservation_definitionId_dimensionKey_windowStar_key" ON "SupplyDemandObservation"("definitionId", "dimensionKey", "windowStart", "windowEnd", "inputDigest");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyDemandSnapshot_snapshotKey_key" ON "SupplyDemandSnapshot"("snapshotKey");

-- CreateIndex
CREATE INDEX "SupplyDemandSnapshot_marketId_windowEnd_generatedAt_idx" ON "SupplyDemandSnapshot"("marketId", "windowEnd", "generatedAt");

-- CreateIndex
CREATE INDEX "SupplyDemandSnapshot_marketId_divisionId_serviceId_windowEn_idx" ON "SupplyDemandSnapshot"("marketId", "divisionId", "serviceId", "windowEnd");

-- CreateIndex
CREATE INDEX "SupplyDemandSnapshot_status_generatedAt_idx" ON "SupplyDemandSnapshot"("status", "generatedAt");

-- CreateIndex
CREATE INDEX "SupplyDemandSnapshot_correlationId_idx" ON "SupplyDemandSnapshot"("correlationId");

-- CreateIndex
CREATE INDEX "MarketReadinessPolicy_marketId_status_effectiveAt_idx" ON "MarketReadinessPolicy"("marketId", "status", "effectiveAt");

-- CreateIndex
CREATE INDEX "MarketReadinessPolicy_configurationDigest_idx" ON "MarketReadinessPolicy"("configurationDigest");

-- CreateIndex
CREATE UNIQUE INDEX "MarketReadinessPolicy_key_version_marketId_key" ON "MarketReadinessPolicy"("key", "version", "marketId");

-- PostgreSQL treats NULLs as distinct in ordinary unique indexes. This expression
-- closes the global-policy concurrency gap while preserving market-scoped versions.
CREATE UNIQUE INDEX "MarketReadinessPolicy_key_version_scope_key" ON "MarketReadinessPolicy"("key", "version", COALESCE("marketId", 'GLOBAL'));

-- CreateIndex
CREATE UNIQUE INDEX "MarketReadinessEvaluation_evaluationKey_key" ON "MarketReadinessEvaluation"("evaluationKey");

-- CreateIndex
CREATE INDEX "MarketReadinessEvaluation_marketId_outcome_evaluatedAt_idx" ON "MarketReadinessEvaluation"("marketId", "outcome", "evaluatedAt");

-- CreateIndex
CREATE INDEX "MarketReadinessEvaluation_policyId_evaluatedAt_idx" ON "MarketReadinessEvaluation"("policyId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "MarketReadinessEvaluation_correlationId_idx" ON "MarketReadinessEvaluation"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpansionCandidate_candidateKey_key" ON "ExpansionCandidate"("candidateKey");

-- CreateIndex
CREATE INDEX "ExpansionCandidate_marketId_type_status_updatedAt_idx" ON "ExpansionCandidate"("marketId", "type", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ExpansionCandidate_divisionId_serviceId_status_idx" ON "ExpansionCandidate"("divisionId", "serviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpansionEvaluation_evaluationKey_key" ON "ExpansionEvaluation"("evaluationKey");

-- CreateIndex
CREATE INDEX "ExpansionEvaluation_candidateId_generatedAt_idx" ON "ExpansionEvaluation"("candidateId", "generatedAt");

-- CreateIndex
CREATE INDEX "ExpansionEvaluation_reviewStatus_generatedAt_idx" ON "ExpansionEvaluation"("reviewStatus", "generatedAt");

-- CreateIndex
CREATE INDEX "ExpansionEvaluation_correlationId_idx" ON "ExpansionEvaluation"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRecommendation_key_key" ON "OperationalRecommendation"("key");

-- CreateIndex
CREATE INDEX "OperationalRecommendation_status_createdAt_idx" ON "OperationalRecommendation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalRecommendation_kind_createdAt_idx" ON "OperationalRecommendation"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_key_key" ON "AIProvider"("key");

-- CreateIndex
CREATE INDEX "AIProvider_status_adapterType_idx" ON "AIProvider"("status", "adapterType");

-- CreateIndex
CREATE INDEX "AIModelPolicy_status_capability_routingPriority_idx" ON "AIModelPolicy"("status", "capability", "routingPriority");

-- CreateIndex
CREATE INDEX "AIModelPolicy_providerId_status_idx" ON "AIModelPolicy"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelPolicy_key_version_key" ON "AIModelPolicy"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AIPromptTemplate_key_key" ON "AIPromptTemplate"("key");

-- CreateIndex
CREATE INDEX "AIPromptTemplate_purpose_riskClass_idx" ON "AIPromptTemplate"("purpose", "riskClass");

-- CreateIndex
CREATE INDEX "AIPromptVersion_status_effectiveAt_idx" ON "AIPromptVersion"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "AIPromptVersion_contentDigest_idx" ON "AIPromptVersion"("contentDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AIPromptVersion_templateId_version_key" ON "AIPromptVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AIOperationDefinition_key_key" ON "AIOperationDefinition"("key");

-- CreateIndex
CREATE INDEX "AIOperationDefinition_status_kind_idx" ON "AIOperationDefinition"("status", "kind");

-- CreateIndex
CREATE INDEX "AIOperationVersion_promptVersionId_idx" ON "AIOperationVersion"("promptVersionId");

-- CreateIndex
CREATE INDEX "AIOperationVersion_riskClass_activatedAt_idx" ON "AIOperationVersion"("riskClass", "activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIOperationVersion_definitionId_version_key" ON "AIOperationVersion"("definitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AIOperationExecution_idempotencyKey_key" ON "AIOperationExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AIOperationExecution_status_nextAttemptAt_idx" ON "AIOperationExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AIOperationExecution_operationVersionId_createdAt_idx" ON "AIOperationExecution"("operationVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "AIOperationExecution_providerId_status_createdAt_idx" ON "AIOperationExecution"("providerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AIOperationExecution_marketId_createdAt_idx" ON "AIOperationExecution"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "AIOperationExecution_correlationId_idx" ON "AIOperationExecution"("correlationId");

-- CreateIndex
CREATE INDEX "AIInputReference_referenceType_referenceId_idx" ON "AIInputReference"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "AIInputReference_executionId_referenceType_referenceId_key" ON "AIInputReference"("executionId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "AIOutputArtifact_executionId_key" ON "AIOutputArtifact"("executionId");

-- CreateIndex
CREATE INDEX "AIOutputArtifact_contentDigest_idx" ON "AIOutputArtifact"("contentDigest");

-- CreateIndex
CREATE INDEX "AIOutputArtifact_validationStatus_createdAt_idx" ON "AIOutputArtifact"("validationStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIEvaluation_evaluationKey_key" ON "AIEvaluation"("evaluationKey");

-- CreateIndex
CREATE INDEX "AIEvaluation_operationVersionId_evaluatedAt_idx" ON "AIEvaluation"("operationVersionId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "AIEvaluation_status_evaluatedAt_idx" ON "AIEvaluation"("status", "evaluatedAt");

-- CreateIndex
CREATE INDEX "AIApproval_decision_createdAt_idx" ON "AIApproval"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "AIApproval_correlationId_idx" ON "AIApproval"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AIApproval_outputArtifactId_reviewerId_key" ON "AIApproval"("outputArtifactId", "reviewerId");

-- CreateIndex
CREATE INDEX "AICostRecord_providerId_recordedAt_idx" ON "AICostRecord"("providerId", "recordedAt");

-- CreateIndex
CREATE INDEX "AICostRecord_modelPolicyId_recordedAt_idx" ON "AICostRecord"("modelPolicyId", "recordedAt");

-- CreateIndex
CREATE INDEX "AICostRecord_marketId_recordedAt_idx" ON "AICostRecord"("marketId", "recordedAt");

-- CreateIndex
CREATE INDEX "AICostRecord_executionId_idx" ON "AICostRecord"("executionId");

-- AddForeignKey
ALTER TABLE "SupplyDemandMetricDefinition" ADD CONSTRAINT "SupplyDemandMetricDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "SupplyDemandMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandSnapshot" ADD CONSTRAINT "SupplyDemandSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandSnapshot" ADD CONSTRAINT "SupplyDemandSnapshot_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDemandSnapshot" ADD CONSTRAINT "SupplyDemandSnapshot_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessPolicy" ADD CONSTRAINT "MarketReadinessPolicy_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessPolicy" ADD CONSTRAINT "MarketReadinessPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessPolicy" ADD CONSTRAINT "MarketReadinessPolicy_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessEvaluation" ADD CONSTRAINT "MarketReadinessEvaluation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "MarketReadinessPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessEvaluation" ADD CONSTRAINT "MarketReadinessEvaluation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketReadinessEvaluation" ADD CONSTRAINT "MarketReadinessEvaluation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SupplyDemandSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionCandidate" ADD CONSTRAINT "ExpansionCandidate_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionCandidate" ADD CONSTRAINT "ExpansionCandidate_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionCandidate" ADD CONSTRAINT "ExpansionCandidate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionCandidate" ADD CONSTRAINT "ExpansionCandidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionEvaluation" ADD CONSTRAINT "ExpansionEvaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ExpansionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionEvaluation" ADD CONSTRAINT "ExpansionEvaluation_readinessEvaluationId_fkey" FOREIGN KEY ("readinessEvaluationId") REFERENCES "MarketReadinessEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionEvaluation" ADD CONSTRAINT "ExpansionEvaluation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRecommendation" ADD CONSTRAINT "OperationalRecommendation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SupplyDemandSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRecommendation" ADD CONSTRAINT "OperationalRecommendation_readinessEvaluationId_fkey" FOREIGN KEY ("readinessEvaluationId") REFERENCES "MarketReadinessEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRecommendation" ADD CONSTRAINT "OperationalRecommendation_expansionEvaluationId_fkey" FOREIGN KEY ("expansionEvaluationId") REFERENCES "ExpansionEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProvider" ADD CONSTRAINT "AIProvider_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPromptTemplate" ADD CONSTRAINT "AIPromptTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPromptVersion" ADD CONSTRAINT "AIPromptVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AIPromptTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPromptVersion" ADD CONSTRAINT "AIPromptVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPromptVersion" ADD CONSTRAINT "AIPromptVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationDefinition" ADD CONSTRAINT "AIOperationDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationVersion" ADD CONSTRAINT "AIOperationVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AIOperationDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationVersion" ADD CONSTRAINT "AIOperationVersion_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "AIPromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_operationVersionId_fkey" FOREIGN KEY ("operationVersionId") REFERENCES "AIOperationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_modelPolicyId_fkey" FOREIGN KEY ("modelPolicyId") REFERENCES "AIModelPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInputReference" ADD CONSTRAINT "AIInputReference_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AIOperationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIOutputArtifact" ADD CONSTRAINT "AIOutputArtifact_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AIOperationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEvaluation" ADD CONSTRAINT "AIEvaluation_operationVersionId_fkey" FOREIGN KEY ("operationVersionId") REFERENCES "AIOperationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIApproval" ADD CONSTRAINT "AIApproval_outputArtifactId_fkey" FOREIGN KEY ("outputArtifactId") REFERENCES "AIOutputArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIApproval" ADD CONSTRAINT "AIApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICostRecord" ADD CONSTRAINT "AICostRecord_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AIOperationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICostRecord" ADD CONSTRAINT "AICostRecord_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICostRecord" ADD CONSTRAINT "AICostRecord_modelPolicyId_fkey" FOREIGN KEY ("modelPolicyId") REFERENCES "AIModelPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICostRecord" ADD CONSTRAINT "AICostRecord_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F10 bounded invariants.
ALTER TABLE "SupplyDemandMetricDefinition" ADD CONSTRAINT "SupplyDemandMetricDefinition_version_check" CHECK ("version" > 0);
ALTER TABLE "SupplyDemandMetricDefinition" ADD CONSTRAINT "SupplyDemandMetricDefinition_lateArrivalMinutes_check" CHECK ("lateArrivalMinutes" BETWEEN 0 AND 10080);
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_window_check" CHECK ("windowEnd" > "windowStart");
ALTER TABLE "SupplyDemandObservation" ADD CONSTRAINT "SupplyDemandObservation_sourceCount_check" CHECK ("sourceCount" >= 0);
ALTER TABLE "SupplyDemandSnapshot" ADD CONSTRAINT "SupplyDemandSnapshot_window_check" CHECK ("windowEnd" > "windowStart");
ALTER TABLE "MarketReadinessPolicy" ADD CONSTRAINT "MarketReadinessPolicy_version_check" CHECK ("version" > 0);
ALTER TABLE "MarketReadinessPolicy" ADD CONSTRAINT "MarketReadinessPolicy_four_eyes_check" CHECK ("reviewedById" IS NULL OR "reviewedById" <> "createdById");
ALTER TABLE "ExpansionEvaluation" ADD CONSTRAINT "ExpansionEvaluation_confidenceBps_check" CHECK ("confidenceBps" BETWEEN 0 AND 10000);
ALTER TABLE "AIProvider" ADD CONSTRAINT "AIProvider_limits_check" CHECK ("timeoutMs" BETWEEN 100 AND 120000 AND "maxConcurrency" BETWEEN 1 AND 100 AND "requestsPerMinute" BETWEEN 1 AND 10000);
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_limits_check" CHECK ("version" > 0 AND "maxInputTokens" BETWEEN 1 AND 1000000 AND "maxOutputTokens" BETWEEN 1 AND 100000 AND "timeoutMs" BETWEEN 100 AND 120000 AND "maxCostMicros" >= 0 AND "routingPriority" BETWEEN 0 AND 10000);
ALTER TABLE "AIModelPolicy" ADD CONSTRAINT "AIModelPolicy_four_eyes_check" CHECK ("reviewedById" IS NULL OR "reviewedById" <> "createdById");
ALTER TABLE "AIPromptVersion" ADD CONSTRAINT "AIPromptVersion_version_check" CHECK ("version" > 0);
ALTER TABLE "AIPromptVersion" ADD CONSTRAINT "AIPromptVersion_four_eyes_check" CHECK ("reviewedById" IS NULL OR "reviewedById" <> "createdById");
ALTER TABLE "AIOperationVersion" ADD CONSTRAINT "AIOperationVersion_limits_check" CHECK ("version" > 0 AND "maxInputBytes" BETWEEN 1 AND 1048576 AND "maxAttempts" BETWEEN 1 AND 10 AND "initialBackoffSeconds" BETWEEN 1 AND 3600 AND "maxBackoffSeconds" BETWEEN "initialBackoffSeconds" AND 86400 AND "maxCostMicros" >= 0);
ALTER TABLE "AIOperationVersion" ADD CONSTRAINT "AIOperationVersion_risk_check" CHECK (("riskClass" = 'HIGH' AND "approvalRequired" = true) OR "riskClass" <> 'HIGH');
ALTER TABLE "AIOperationExecution" ADD CONSTRAINT "AIOperationExecution_attemptCount_check" CHECK ("attemptCount" BETWEEN 0 AND 10);
ALTER TABLE "AIEvaluation" ADD CONSTRAINT "AIEvaluation_scores_check" CHECK ("sampleSize" > 0 AND "schemaPassRateBps" BETWEEN 0 AND 10000 AND "safetyPassRateBps" BETWEEN 0 AND 10000 AND "qualityScoreBps" BETWEEN 0 AND 10000 AND "p95LatencyMs" >= 0 AND "estimatedCostMicros" >= 0);
ALTER TABLE "AICostRecord" ADD CONSTRAINT "AICostRecord_values_check" CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "estimatedCostMicros" >= 0 AND ("actualCostMicros" IS NULL OR "actualCostMicros" >= 0));

-- Active definitions and evidence are immutable. Corrections use new versions/rows.
CREATE OR REPLACE FUNCTION "f10_protect_versioned_definition"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status"::text <> 'DRAFT' THEN
    RAISE EXCEPTION 'active or retired F10 definition cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status"::text <> 'DRAFT' THEN
    IF to_jsonb(OLD) - ARRAY['status','reviewedById','reviewedAt','reviewReason','effectiveAt','retiredAt']
       IS DISTINCT FROM
       to_jsonb(NEW) - ARRAY['status','reviewedById','reviewedAt','reviewReason','effectiveAt','retiredAt'] THEN
      RAISE EXCEPTION 'active or retired F10 definition body is immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "SupplyDemandMetricDefinition_immutable"
BEFORE UPDATE OR DELETE ON "SupplyDemandMetricDefinition"
FOR EACH ROW EXECUTE FUNCTION "f10_protect_versioned_definition"();
CREATE TRIGGER "MarketReadinessPolicy_immutable"
BEFORE UPDATE OR DELETE ON "MarketReadinessPolicy"
FOR EACH ROW EXECUTE FUNCTION "f10_protect_versioned_definition"();
CREATE TRIGGER "AIModelPolicy_immutable"
BEFORE UPDATE OR DELETE ON "AIModelPolicy"
FOR EACH ROW EXECUTE FUNCTION "f10_protect_versioned_definition"();
CREATE TRIGGER "AIPromptVersion_immutable"
BEFORE UPDATE OR DELETE ON "AIPromptVersion"
FOR EACH ROW EXECUTE FUNCTION "f10_protect_versioned_definition"();

CREATE OR REPLACE FUNCTION "f10_prevent_evidence_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'F10 evidence is append-only';
END;
$$;

CREATE TRIGGER "SupplyDemandObservation_append_only" BEFORE UPDATE OR DELETE ON "SupplyDemandObservation" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();
CREATE TRIGGER "SupplyDemandSnapshot_append_only" BEFORE UPDATE OR DELETE ON "SupplyDemandSnapshot" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();
CREATE TRIGGER "MarketReadinessEvaluation_append_only" BEFORE UPDATE OR DELETE ON "MarketReadinessEvaluation" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();
CREATE TRIGGER "AIEvaluation_append_only" BEFORE UPDATE OR DELETE ON "AIEvaluation" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();
CREATE TRIGGER "AIOutputArtifact_append_only" BEFORE UPDATE OR DELETE ON "AIOutputArtifact" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();
CREATE TRIGGER "AICostRecord_append_only" BEFORE UPDATE OR DELETE ON "AICostRecord" FOR EACH ROW EXECUTE FUNCTION "f10_prevent_evidence_mutation"();

-- Default deny for Supabase API roles; the trusted backend role owns execution.
DO $block$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'SupplyDemandMetricDefinition','SupplyDemandObservation','SupplyDemandSnapshot','MarketReadinessPolicy',
    'MarketReadinessEvaluation','ExpansionCandidate','ExpansionEvaluation','OperationalRecommendation',
    'AIProvider','AIModelPolicy','AIPromptTemplate','AIPromptVersion','AIOperationDefinition','AIOperationVersion',
    'AIOperationExecution','AIInputReference','AIOutputArtifact','AIEvaluation','AIApproval','AICostRecord'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', target);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', target); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', target); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', target); END IF;
  END LOOP;
END $block$;
