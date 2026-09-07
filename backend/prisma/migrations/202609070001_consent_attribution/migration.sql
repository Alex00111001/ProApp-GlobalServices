CREATE TYPE "ConsentPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ConsentEnforcementMode" AS ENUM ('EXPLICIT_GRANT', 'POLICY_ONLY', 'PROHIBITED');
CREATE TYPE "LegalReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ConsentSubjectType" AS ENUM ('USER', 'PROFESSIONAL', 'ANONYMOUS', 'SESSION');
CREATE TYPE "ConsentDecisionType" AS ENUM ('GRANTED', 'DENIED', 'WITHDRAWN');
CREATE TYPE "AttributionModelType" AS ENUM ('FIRST_TOUCH', 'LAST_TOUCH');
CREATE TYPE "AttributionModelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "AttributionStatus" AS ENUM ('ATTRIBUTED', 'UNATTRIBUTED', 'BLOCKED_CONSENT');

CREATE TABLE "ConsentPolicy" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "purpose" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "countryCode" TEXT NOT NULL, "locale" TEXT NOT NULL, "status" "ConsentPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "legalBasis" TEXT NOT NULL, "enforcementMode" "ConsentEnforcementMode" NOT NULL,
  "documentReference" TEXT NOT NULL, "documentDigest" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3), "retiredAt" TIMESTAMP(3), "retentionDays" INTEGER,
  "reviewStatus" "LegalReviewStatus" NOT NULL DEFAULT 'PENDING', "reviewReference" TEXT,
  "reviewedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsentPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsentPolicy_version_positive" CHECK ("version" > 0),
  CONSTRAINT "ConsentPolicy_country_iso" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "ConsentPolicy_locale_safe" CHECK ("locale" ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  CONSTRAINT "ConsentPolicy_key_safe" CHECK ("key" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "ConsentPolicy_purpose_safe" CHECK ("purpose" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "ConsentPolicy_legal_basis_safe" CHECK ("legalBasis" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "ConsentPolicy_document_digest" CHECK ("documentDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ConsentPolicy_retention_bounded" CHECK ("retentionDays" IS NULL OR "retentionDays" BETWEEN 1 AND 3650),
  CONSTRAINT "ConsentPolicy_window_valid" CHECK ("retiredAt" IS NULL OR ("effectiveAt" IS NOT NULL AND "retiredAt" > "effectiveAt")),
  CONSTRAINT "ConsentPolicy_active_reviewed" CHECK ("status" <> 'ACTIVE' OR ("reviewStatus" = 'APPROVED' AND "effectiveAt" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL AND length(trim("reviewReference")) >= 8))
);

CREATE TABLE "ConsentDecision" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "policyId" TEXT NOT NULL, "policyVersion" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL, "subjectKey" TEXT NOT NULL, "subjectType" "ConsentSubjectType" NOT NULL,
  "userId" TEXT, "decision" "ConsentDecisionType" NOT NULL, "source" TEXT NOT NULL, "evidence" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "requestId" TEXT, "correlationId" TEXT,
  "traceId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsentDecision_subject_hash" CHECK ("subjectKey" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ConsentDecision_purpose_safe" CHECK ("purpose" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "ConsentDecision_source_safe" CHECK ("source" ~ '^[A-Z0-9_:-]{2,64}$')
);

CREATE TABLE "SubjectIdentityLink" (
  "id" TEXT NOT NULL, "anonymousSubjectKey" TEXT NOT NULL, "authenticatedSubjectKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "proofDigest" TEXT NOT NULL, "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT, "correlationId" TEXT, "traceId" TEXT,
  CONSTRAINT "SubjectIdentityLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubjectIdentityLink_anonymous_hash" CHECK ("anonymousSubjectKey" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SubjectIdentityLink_authenticated_hash" CHECK ("authenticatedSubjectKey" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SubjectIdentityLink_distinct" CHECK ("anonymousSubjectKey" <> "authenticatedSubjectKey"),
  CONSTRAINT "SubjectIdentityLink_proof_digest" CHECK ("proofDigest" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "Touchpoint" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "subjectKey" TEXT NOT NULL,
  "subjectType" "ConsentSubjectType" NOT NULL, "userId" TEXT, "identityLinkId" TEXT,
  "policyId" TEXT NOT NULL, "policyVersion" INTEGER NOT NULL, "consentDecisionId" TEXT,
  "campaignId" TEXT, "leadId" TEXT, "marketingEventId" TEXT, "source" TEXT NOT NULL,
  "medium" TEXT, "channel" TEXT, "referrerOrigin" TEXT, "referrerPath" TEXT, "landingPath" TEXT,
  "context" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT, "correlationId" TEXT, "traceId" TEXT,
  CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Touchpoint_subject_hash" CHECK ("subjectKey" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "Touchpoint_source_safe" CHECK (length(trim("source")) BETWEEN 1 AND 64),
  CONSTRAINT "Touchpoint_referrer_origin_safe" CHECK ("referrerOrigin" IS NULL OR "referrerOrigin" ~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$'),
  CONSTRAINT "Touchpoint_paths_safe" CHECK (("referrerPath" IS NULL OR (left("referrerPath", 1) = '/' AND position('?' in "referrerPath") = 0 AND position('#' in "referrerPath") = 0)) AND ("landingPath" IS NULL OR (left("landingPath", 1) = '/' AND position('?' in "landingPath") = 0 AND position('#' in "landingPath") = 0)))
);

CREATE TABLE "AttributionModel" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "version" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "type" "AttributionModelType" NOT NULL, "purpose" TEXT NOT NULL, "windowDays" INTEGER NOT NULL,
  "status" "AttributionModelStatus" NOT NULL DEFAULT 'DRAFT', "effectiveAt" TIMESTAMP(3), "retiredAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttributionModel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttributionModel_version_positive" CHECK ("version" > 0),
  CONSTRAINT "AttributionModel_window_bounded" CHECK ("windowDays" BETWEEN 1 AND 366),
  CONSTRAINT "AttributionModel_key_safe" CHECK ("key" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "AttributionModel_purpose_safe" CHECK ("purpose" ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  CONSTRAINT "AttributionModel_window_valid" CHECK ("retiredAt" IS NULL OR ("effectiveAt" IS NOT NULL AND "retiredAt" > "effectiveAt")),
  CONSTRAINT "AttributionModel_active_effective" CHECK ("status" <> 'ACTIVE' OR "effectiveAt" IS NOT NULL)
);

CREATE TABLE "Attribution" (
  "id" TEXT NOT NULL, "attributionKey" TEXT NOT NULL, "conversionId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL, "modelVersion" INTEGER NOT NULL, "touchpointId" TEXT,
  "status" "AttributionStatus" NOT NULL, "reasonCode" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL, "windowEndedAt" TIMESTAMP(3) NOT NULL,
  "inputDigest" TEXT NOT NULL, "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT, "correlationId" TEXT, "traceId" TEXT,
  CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attribution_input_digest" CHECK ("inputDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "Attribution_reason_safe" CHECK ("reasonCode" ~ '^[A-Z0-9_:-]{2,64}$'),
  CONSTRAINT "Attribution_window_valid" CHECK ("windowStartedAt" < "windowEndedAt"),
  CONSTRAINT "Attribution_touchpoint_status" CHECK (("status" = 'ATTRIBUTED') = ("touchpointId" IS NOT NULL))
);

CREATE UNIQUE INDEX "ConsentPolicy_key_version_countryCode_locale_key" ON "ConsentPolicy"("key", "version", "countryCode", "locale");
CREATE UNIQUE INDEX "ConsentPolicy_id_version_key" ON "ConsentPolicy"("id", "version");
CREATE INDEX "ConsentPolicy_purpose_countryCode_locale_status_effectiveAt_idx" ON "ConsentPolicy"("purpose", "countryCode", "locale", "status", "effectiveAt");
CREATE INDEX "ConsentPolicy_createdById_idx" ON "ConsentPolicy"("createdById");
CREATE INDEX "ConsentPolicy_reviewedById_idx" ON "ConsentPolicy"("reviewedById");
CREATE UNIQUE INDEX "ConsentDecision_idempotencyKey_key" ON "ConsentDecision"("idempotencyKey");
CREATE INDEX "ConsentDecision_subjectKey_purpose_occurredAt_idx" ON "ConsentDecision"("subjectKey", "purpose", "occurredAt");
CREATE INDEX "ConsentDecision_userId_purpose_occurredAt_idx" ON "ConsentDecision"("userId", "purpose", "occurredAt");
CREATE INDEX "ConsentDecision_policyId_decision_occurredAt_idx" ON "ConsentDecision"("policyId", "decision", "occurredAt");
CREATE INDEX "ConsentDecision_correlationId_idx" ON "ConsentDecision"("correlationId");
CREATE UNIQUE INDEX "SubjectIdentityLink_anonymousSubjectKey_key" ON "SubjectIdentityLink"("anonymousSubjectKey");
CREATE UNIQUE INDEX "SubjectIdentityLink_proofDigest_key" ON "SubjectIdentityLink"("proofDigest");
CREATE INDEX "SubjectIdentityLink_authenticatedSubjectKey_linkedAt_idx" ON "SubjectIdentityLink"("authenticatedSubjectKey", "linkedAt");
CREATE INDEX "SubjectIdentityLink_userId_linkedAt_idx" ON "SubjectIdentityLink"("userId", "linkedAt");
CREATE UNIQUE INDEX "Touchpoint_idempotencyKey_key" ON "Touchpoint"("idempotencyKey");
CREATE UNIQUE INDEX "Touchpoint_marketingEventId_key" ON "Touchpoint"("marketingEventId");
CREATE INDEX "Touchpoint_subjectKey_occurredAt_idx" ON "Touchpoint"("subjectKey", "occurredAt");
CREATE INDEX "Touchpoint_userId_occurredAt_idx" ON "Touchpoint"("userId", "occurredAt");
CREATE INDEX "Touchpoint_campaignId_occurredAt_idx" ON "Touchpoint"("campaignId", "occurredAt");
CREATE INDEX "Touchpoint_policyId_occurredAt_idx" ON "Touchpoint"("policyId", "occurredAt");
CREATE INDEX "Touchpoint_consentDecisionId_idx" ON "Touchpoint"("consentDecisionId");
CREATE INDEX "Touchpoint_identityLinkId_idx" ON "Touchpoint"("identityLinkId");
CREATE INDEX "Touchpoint_leadId_occurredAt_idx" ON "Touchpoint"("leadId", "occurredAt");
CREATE INDEX "Touchpoint_source_medium_occurredAt_idx" ON "Touchpoint"("source", "medium", "occurredAt");
CREATE INDEX "Touchpoint_correlationId_idx" ON "Touchpoint"("correlationId");
CREATE UNIQUE INDEX "AttributionModel_key_version_key" ON "AttributionModel"("key", "version");
CREATE UNIQUE INDEX "AttributionModel_id_version_key" ON "AttributionModel"("id", "version");
CREATE INDEX "AttributionModel_status_type_effectiveAt_idx" ON "AttributionModel"("status", "type", "effectiveAt");
CREATE INDEX "AttributionModel_createdById_idx" ON "AttributionModel"("createdById");
CREATE UNIQUE INDEX "Attribution_attributionKey_key" ON "Attribution"("attributionKey");
CREATE UNIQUE INDEX "Attribution_conversionId_modelId_key" ON "Attribution"("conversionId", "modelId");
CREATE INDEX "Attribution_modelId_status_calculatedAt_idx" ON "Attribution"("modelId", "status", "calculatedAt");
CREATE INDEX "Attribution_touchpointId_idx" ON "Attribution"("touchpointId");
CREATE INDEX "Attribution_conversionId_calculatedAt_idx" ON "Attribution"("conversionId", "calculatedAt");
CREATE INDEX "Attribution_correlationId_idx" ON "Attribution"("correlationId");

ALTER TABLE "ConsentPolicy" ADD CONSTRAINT "ConsentPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentPolicy" ADD CONSTRAINT "ConsentPolicy_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentDecision" ADD CONSTRAINT "ConsentDecision_policyId_policyVersion_fkey" FOREIGN KEY ("policyId", "policyVersion") REFERENCES "ConsentPolicy"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentDecision" ADD CONSTRAINT "ConsentDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubjectIdentityLink" ADD CONSTRAINT "SubjectIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_identityLinkId_fkey" FOREIGN KEY ("identityLinkId") REFERENCES "SubjectIdentityLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_policyId_policyVersion_fkey" FOREIGN KEY ("policyId", "policyVersion") REFERENCES "ConsentPolicy"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_consentDecisionId_fkey" FOREIGN KEY ("consentDecisionId") REFERENCES "ConsentDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_marketingEventId_fkey" FOREIGN KEY ("marketingEventId") REFERENCES "MarketingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttributionModel" ADD CONSTRAINT "AttributionModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_modelId_modelVersion_fkey" FOREIGN KEY ("modelId", "modelVersion") REFERENCES "AttributionModel"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_touchpointId_fkey" FOREIGN KEY ("touchpointId") REFERENCES "Touchpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION homeservices_prevent_f7_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('homeservices.allow_immutable_cleanup', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is immutable; append a new fact or version instead', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "ConsentDecision_immutable" BEFORE UPDATE OR DELETE ON "ConsentDecision" FOR EACH ROW EXECUTE FUNCTION homeservices_prevent_f7_history_mutation();
CREATE TRIGGER "SubjectIdentityLink_immutable" BEFORE UPDATE OR DELETE ON "SubjectIdentityLink" FOR EACH ROW EXECUTE FUNCTION homeservices_prevent_f7_history_mutation();
CREATE TRIGGER "Touchpoint_immutable" BEFORE UPDATE OR DELETE ON "Touchpoint" FOR EACH ROW EXECUTE FUNCTION homeservices_prevent_f7_history_mutation();
CREATE TRIGGER "Attribution_immutable" BEFORE UPDATE OR DELETE ON "Attribution" FOR EACH ROW EXECUTE FUNCTION homeservices_prevent_f7_history_mutation();

CREATE OR REPLACE FUNCTION homeservices_guard_f7_version_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'DRAFT' THEN RETURN NEW; END IF;
  IF OLD."status" = 'ACTIVE' AND NEW."status" = 'RETIRED'
     AND to_jsonb(NEW) - ARRAY['status', 'retiredAt', 'updatedAt']::text[] = to_jsonb(OLD) - ARRAY['status', 'retiredAt', 'updatedAt']::text[] THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% active/retired versions are immutable; create a new version', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "ConsentPolicy_version_lifecycle" BEFORE UPDATE ON "ConsentPolicy" FOR EACH ROW EXECUTE FUNCTION homeservices_guard_f7_version_lifecycle();
CREATE TRIGGER "AttributionModel_version_lifecycle" BEFORE UPDATE ON "AttributionModel" FOR EACH ROW EXECUTE FUNCTION homeservices_guard_f7_version_lifecycle();

ALTER TABLE "ConsentPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentPolicy" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ConsentDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentDecision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SubjectIdentityLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubjectIdentityLink" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Touchpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Touchpoint" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AttributionModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttributionModel" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Attribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attribution" FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "ConsentPolicy", "ConsentDecision", "SubjectIdentityLink", "Touchpoint", "AttributionModel", "Attribution" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "ConsentPolicy", "ConsentDecision", "SubjectIdentityLink", "Touchpoint", "AttributionModel", "Attribution" FROM authenticated; END IF;
END $$;
REVOKE ALL ON "ConsentPolicy", "ConsentDecision", "SubjectIdentityLink", "Touchpoint", "AttributionModel", "Attribution" FROM PUBLIC;
