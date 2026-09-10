-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperimentMetricRole" AS ENUM ('PRIMARY', 'GUARDRAIL');

-- CreateEnum
CREATE TYPE "ExperimentAggregation" AS ENUM ('UNIQUE_SUBJECT_RATE', 'EVENT_RATE');

-- CreateEnum
CREATE TYPE "ExperimentDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "ExperimentAnalysisStatus" AS ENUM ('INCONCLUSIVE', 'READY', 'GUARDRAIL_BLOCKED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('LANDING_PAGE', 'CATEGORY_PAGE', 'SERVICE_PAGE', 'LOCATION_PAGE', 'HELP_FAQ', 'CAMPAIGN_LANDING', 'SEO_METADATA_BLOCK');

-- CreateEnum
CREATE TYPE "ContentEntryStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ContentVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ContentApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentPublicationStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'RETIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SeoRedirectStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SitemapStatus" AS ENUM ('GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "marketId" TEXT NOT NULL,
    "layerKey" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "featureFlagKey" TEXT NOT NULL,
    "trafficAllocationBps" INTEGER NOT NULL DEFAULT 0,
    "killSwitch" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentVersion" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "marketPolicyVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "analysisAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "minimumSampleSize" INTEGER NOT NULL DEFAULT 100,
    "significanceAlpha" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "configurationDigest" TEXT NOT NULL,
    "readyAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentVariant" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "weightBps" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentAudience" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "conditionTree" JSONB,
    "configurationDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "locale" TEXT NOT NULL,
    "bucketBps" INTEGER NOT NULL,
    "consentDecisionId" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentExposure" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "consentDecisionId" TEXT,
    "surface" TEXT NOT NULL,
    "context" JSONB,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentExposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentMetricDefinition" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "role" "ExperimentMetricRole" NOT NULL,
    "eventName" TEXT NOT NULL,
    "aggregation" "ExperimentAggregation" NOT NULL,
    "windowHours" INTEGER NOT NULL,
    "direction" "ExperimentDirection" NOT NULL,
    "minimumSampleSize" INTEGER NOT NULL,
    "guardrailThreshold" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentResultSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotKey" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" "ExperimentAnalysisStatus" NOT NULL,
    "method" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "marketId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "marketPolicyVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ContentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "seoTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "canonicalPath" TEXT NOT NULL,
    "robotsDirective" TEXT NOT NULL DEFAULT 'noindex,nofollow',
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "openGraph" JSONB,
    "structuredData" JSONB,
    "qualityEvidence" JSONB NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "provenance" JSONB,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "divisionId" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentApproval" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "decision" "ContentApprovalDecision" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPublication" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "ContentPublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "canonicalPath" TEXT NOT NULL,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "publishedById" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRedirect" (
    "id" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "status" "SeoRedirectStatus" NOT NULL DEFAULT 'ACTIVE',
    "httpStatus" INTEGER NOT NULL DEFAULT 308,
    "contentEntryId" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "SeoRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoSitemapSnapshot" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "SitemapStatus" NOT NULL,
    "urlCount" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "safeError" TEXT,
    "correlationId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoSitemapSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_key_key" ON "Experiment"("key");

-- CreateIndex
CREATE INDEX "Experiment_status_marketId_surface_updatedAt_idx" ON "Experiment"("status", "marketId", "surface", "updatedAt");

-- CreateIndex
CREATE INDEX "Experiment_featureFlagKey_status_idx" ON "Experiment"("featureFlagKey", "status");

-- CreateIndex
CREATE INDEX "Experiment_createdById_idx" ON "Experiment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_marketId_layerKey_surface_key_key" ON "Experiment"("marketId", "layerKey", "surface", "key");

-- CreateIndex
CREATE INDEX "ExperimentVersion_marketPolicyVersionId_idx" ON "ExperimentVersion"("marketPolicyVersionId");

-- CreateIndex
CREATE INDEX "ExperimentVersion_startAt_endAt_idx" ON "ExperimentVersion"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentVersion_experimentId_version_key" ON "ExperimentVersion"("experimentId", "version");

-- CreateIndex
CREATE INDEX "ExperimentVariant_versionId_isControl_idx" ON "ExperimentVariant"("versionId", "isControl");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentVariant_versionId_key_key" ON "ExperimentVariant"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentVariant_id_versionId_key" ON "ExperimentVariant"("id", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentAudience_versionId_key" ON "ExperimentAudience"("versionId");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_variantId_assignedAt_idx" ON "ExperimentAssignment"("variantId", "assignedAt");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_subjectKey_assignedAt_idx" ON "ExperimentAssignment"("subjectKey", "assignedAt");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_correlationId_idx" ON "ExperimentAssignment"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentAssignment_versionId_subjectKey_key" ON "ExperimentAssignment"("versionId", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentExposure_eventId_key" ON "ExperimentExposure"("eventId");

-- CreateIndex
CREATE INDEX "ExperimentExposure_versionId_variantId_exposedAt_idx" ON "ExperimentExposure"("versionId", "variantId", "exposedAt");

-- CreateIndex
CREATE INDEX "ExperimentExposure_correlationId_idx" ON "ExperimentExposure"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentExposure_assignmentId_eventId_key" ON "ExperimentExposure"("assignmentId", "eventId");

-- CreateIndex
CREATE INDEX "ExperimentMetricDefinition_eventName_role_idx" ON "ExperimentMetricDefinition"("eventName", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentMetricDefinition_versionId_key_key" ON "ExperimentMetricDefinition"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentResultSnapshot_snapshotKey_key" ON "ExperimentResultSnapshot"("snapshotKey");

-- CreateIndex
CREATE INDEX "ExperimentResultSnapshot_versionId_generatedAt_idx" ON "ExperimentResultSnapshot"("versionId", "generatedAt");

-- CreateIndex
CREATE INDEX "ExperimentResultSnapshot_status_generatedAt_idx" ON "ExperimentResultSnapshot"("status", "generatedAt");

-- CreateIndex
CREATE INDEX "ExperimentResultSnapshot_correlationId_idx" ON "ExperimentResultSnapshot"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentEntry_key_key" ON "ContentEntry"("key");

-- CreateIndex
CREATE INDEX "ContentEntry_marketId_type_status_updatedAt_idx" ON "ContentEntry"("marketId", "type", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentEntry_createdById_idx" ON "ContentEntry"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ContentEntry_marketId_key_key" ON "ContentEntry"("marketId", "key");

-- CreateIndex
CREATE INDEX "ContentVersion_marketPolicyVersionId_idx" ON "ContentVersion"("marketPolicyVersionId");

-- CreateIndex
CREATE INDEX "ContentVersion_status_locale_updatedAt_idx" ON "ContentVersion"("status", "locale", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentVersion_contentDigest_indexable_idx" ON "ContentVersion"("contentDigest", "indexable");

-- CreateIndex
CREATE INDEX "ContentVersion_categoryId_idx" ON "ContentVersion"("categoryId");

-- CreateIndex
CREATE INDEX "ContentVersion_serviceId_idx" ON "ContentVersion"("serviceId");

-- CreateIndex
CREATE INDEX "ContentVersion_divisionId_idx" ON "ContentVersion"("divisionId");

-- CreateIndex
CREATE INDEX "ContentVersion_createdById_idx" ON "ContentVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_entryId_version_key" ON "ContentVersion"("entryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_locale_canonicalPath_version_key" ON "ContentVersion"("locale", "canonicalPath", "version");

-- CreateIndex
CREATE INDEX "ContentApproval_versionId_decision_createdAt_idx" ON "ContentApproval"("versionId", "decision", "createdAt");

-- CreateIndex
CREATE INDEX "ContentApproval_reviewerId_createdAt_idx" ON "ContentApproval"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentApproval_versionId_reviewerId_key" ON "ContentApproval"("versionId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPublication_versionId_key" ON "ContentPublication"("versionId");

-- CreateIndex
CREATE INDEX "ContentPublication_status_publishAt_idx" ON "ContentPublication"("status", "publishAt");

-- CreateIndex
CREATE INDEX "ContentPublication_locale_indexable_status_publishedAt_idx" ON "ContentPublication"("locale", "indexable", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentPublication_path_status_idx" ON "ContentPublication"("path", "status");

-- CreateIndex
CREATE INDEX "ContentPublication_correlationId_idx" ON "ContentPublication"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRedirect_sourcePath_key" ON "SeoRedirect"("sourcePath");

-- CreateIndex
CREATE INDEX "SeoRedirect_status_createdAt_idx" ON "SeoRedirect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SeoRedirect_contentEntryId_idx" ON "SeoRedirect"("contentEntryId");

-- CreateIndex
CREATE INDEX "SeoSitemapSnapshot_marketId_locale_generatedAt_idx" ON "SeoSitemapSnapshot"("marketId", "locale", "generatedAt");

-- CreateIndex
CREATE INDEX "SeoSitemapSnapshot_status_generatedAt_idx" ON "SeoSitemapSnapshot"("status", "generatedAt");

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVersion" ADD CONSTRAINT "ExperimentVersion_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVersion" ADD CONSTRAINT "ExperimentVersion_marketPolicyVersionId_fkey" FOREIGN KEY ("marketPolicyVersionId") REFERENCES "MarketPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentAudience" ADD CONSTRAINT "ExperimentAudience_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_variantId_versionId_fkey" FOREIGN KEY ("variantId", "versionId") REFERENCES "ExperimentVariant"("id", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_consentDecisionId_fkey" FOREIGN KEY ("consentDecisionId") REFERENCES "ConsentDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentExposure" ADD CONSTRAINT "ExperimentExposure_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExperimentAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentExposure" ADD CONSTRAINT "ExperimentExposure_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentExposure" ADD CONSTRAINT "ExperimentExposure_variantId_versionId_fkey" FOREIGN KEY ("variantId", "versionId") REFERENCES "ExperimentVariant"("id", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentExposure" ADD CONSTRAINT "ExperimentExposure_consentDecisionId_fkey" FOREIGN KEY ("consentDecisionId") REFERENCES "ConsentDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentMetricDefinition" ADD CONSTRAINT "ExperimentMetricDefinition_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentResultSnapshot" ADD CONSTRAINT "ExperimentResultSnapshot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExperimentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContentEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_marketPolicyVersionId_fkey" FOREIGN KEY ("marketPolicyVersionId") REFERENCES "MarketPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApproval" ADD CONSTRAINT "ContentApproval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApproval" ADD CONSTRAINT "ContentApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoRedirect" ADD CONSTRAINT "SeoRedirect_contentEntryId_fkey" FOREIGN KEY ("contentEntryId") REFERENCES "ContentEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoRedirect" ADD CONSTRAINT "SeoRedirect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoSitemapSnapshot" ADD CONSTRAINT "SeoSitemapSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additional bounded invariants and concurrency protections.
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_trafficAllocationBps_check" CHECK ("trafficAllocationBps" BETWEEN 0 AND 10000);
ALTER TABLE "ExperimentVersion" ADD CONSTRAINT "ExperimentVersion_minimumSampleSize_check" CHECK ("minimumSampleSize" BETWEEN 10 AND 10000000);
ALTER TABLE "ExperimentVersion" ADD CONSTRAINT "ExperimentVersion_significanceAlpha_check" CHECK ("significanceAlpha" > 0 AND "significanceAlpha" < 0.5);
ALTER TABLE "ExperimentVersion" ADD CONSTRAINT "ExperimentVersion_dates_check" CHECK ("endAt" IS NULL OR "startAt" IS NULL OR "endAt" > "startAt");
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_weightBps_check" CHECK ("weightBps" > 0 AND "weightBps" <= 10000);
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_bucketBps_check" CHECK ("bucketBps" BETWEEN 0 AND 9999);
ALTER TABLE "ExperimentMetricDefinition" ADD CONSTRAINT "ExperimentMetricDefinition_windowHours_check" CHECK ("windowHours" BETWEEN 1 AND 8760);
ALTER TABLE "ExperimentMetricDefinition" ADD CONSTRAINT "ExperimentMetricDefinition_minimumSampleSize_check" CHECK ("minimumSampleSize" BETWEEN 10 AND 10000000);
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_dates_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "publishAt");
ALTER TABLE "SeoRedirect" ADD CONSTRAINT "SeoRedirect_httpStatus_check" CHECK ("httpStatus" IN (301, 308, 410));
ALTER TABLE "SeoSitemapSnapshot" ADD CONSTRAINT "SeoSitemapSnapshot_urlCount_check" CHECK ("urlCount" BETWEEN 0 AND 50000);

CREATE UNIQUE INDEX "Experiment_one_running_layer_surface_market" ON "Experiment" ("marketId", "layerKey", "surface") WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "ExperimentVariant_one_control_per_version" ON "ExperimentVariant" ("versionId") WHERE "isControl" = true;
CREATE UNIQUE INDEX "ContentPublication_one_live_path" ON "ContentPublication" ("path") WHERE "status" IN ('SCHEDULED', 'PUBLISHED');
CREATE UNIQUE INDEX "ContentVersion_one_indexable_digest" ON "ContentVersion" ("contentDigest") WHERE "indexable" = true AND "status" IN ('APPROVED', 'SCHEDULED', 'PUBLISHED');

CREATE OR REPLACE FUNCTION "f9_prevent_experiment_configuration_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lifecycle "ExperimentStatus";
BEGIN
  SELECT e."status" INTO lifecycle
  FROM "ExperimentVersion" v JOIN "Experiment" e ON e."id" = v."experimentId"
  WHERE v."id" = OLD."versionId";
  IF lifecycle <> 'DRAFT' THEN
    RAISE EXCEPTION 'experiment version configuration is immutable outside DRAFT';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "ExperimentVariant_immutable_after_draft"
BEFORE UPDATE OR DELETE ON "ExperimentVariant"
FOR EACH ROW EXECUTE FUNCTION "f9_prevent_experiment_configuration_mutation"();
CREATE TRIGGER "ExperimentAudience_immutable_after_draft"
BEFORE UPDATE OR DELETE ON "ExperimentAudience"
FOR EACH ROW EXECUTE FUNCTION "f9_prevent_experiment_configuration_mutation"();
CREATE TRIGGER "ExperimentMetricDefinition_immutable_after_draft"
BEFORE UPDATE OR DELETE ON "ExperimentMetricDefinition"
FOR EACH ROW EXECUTE FUNCTION "f9_prevent_experiment_configuration_mutation"();

CREATE OR REPLACE FUNCTION "f9_protect_content_version_body"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'reviewed content version cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'DRAFT' AND (
    OLD."entryId", OLD."marketPolicyVersionId", OLD."version", OLD."locale", OLD."slug",
    OLD."title", OLD."summary", OLD."body", OLD."seoTitle", OLD."metaDescription",
    OLD."canonicalPath", OLD."robotsDirective", OLD."openGraph",
    OLD."structuredData", OLD."qualityEvidence", OLD."contentDigest", OLD."provenance",
       OLD."categoryId", OLD."serviceId", OLD."divisionId", OLD."createdById"
  ) IS DISTINCT FROM (
    NEW."entryId", NEW."marketPolicyVersionId", NEW."version", NEW."locale", NEW."slug",
    NEW."title", NEW."summary", NEW."body", NEW."seoTitle", NEW."metaDescription",
    NEW."canonicalPath", NEW."robotsDirective", NEW."openGraph",
    NEW."structuredData", NEW."qualityEvidence", NEW."contentDigest", NEW."provenance",
    NEW."categoryId", NEW."serviceId", NEW."divisionId", NEW."createdById"
  ) THEN
    RAISE EXCEPTION 'reviewed content version body is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "ContentVersion_immutable_after_review"
BEFORE UPDATE OR DELETE ON "ContentVersion"
FOR EACH ROW EXECUTE FUNCTION "f9_protect_content_version_body"();

-- Default deny: no policies are created and Supabase API roles receive no grants.
DO $block$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'Experiment','ExperimentVersion','ExperimentVariant','ExperimentAudience','ExperimentAssignment','ExperimentExposure',
    'ExperimentMetricDefinition','ExperimentResultSnapshot','ContentEntry','ContentVersion','ContentApproval',
    'ContentPublication','SeoRedirect','SeoSitemapSnapshot'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', target); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', target); END IF;
  END LOOP;
END $block$;
