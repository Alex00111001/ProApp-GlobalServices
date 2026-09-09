-- F8.5 Markets, Identity and Geography foundation.
-- Additive only: legacy country/address/service-radius fields remain during expand/migrate/contract.

CREATE TYPE "CountryLifecycle" AS ENUM ('ACTIVE', 'DEPRECATED');
CREATE TYPE "MarketStatus" AS ENUM ('DRAFT', 'DISABLED', 'READY', 'ACTIVE', 'SUSPENDED', 'RETIRED');
CREATE TYPE "MarketPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "GeographyImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AdministrativeDivisionLifecycle" AS ENUM ('ACTIVE', 'DEPRECATED', 'DISABLED');
CREATE TYPE "GeographyChangeType" AS ENUM ('CREATED', 'RENAMED', 'REPARENTED', 'CODE_CHANGED', 'DEPRECATED', 'REACTIVATED');
CREATE TYPE "AddressPurpose" AS ENUM ('CLIENT_CONTACT', 'PROFESSIONAL_DOMICILE', 'BOOKING_SERVICE', 'BILLING');
CREATE TYPE "AddressValidationStatus" AS ENUM ('UNVALIDATED', 'FORMAT_VALID', 'VERIFIED', 'REJECTED');
CREATE TYPE "ProfessionalServiceAreaKind" AS ENUM ('ADMINISTRATIVE_DIVISION', 'RADIUS', 'POLYGON');
CREATE TYPE "ProfessionalServiceAreaLifecycle" AS ENUM ('ACTIVE', 'DISABLED', 'RETIRED');
CREATE TYPE "IdentityFormatStatus" AS ENUM ('UNCHECKED', 'VALID', 'INVALID');
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "IdentityDocumentLifecycle" AS ENUM ('ACTIVE', 'RETIRED', 'REVOKED');

CREATE TABLE "Country" (
  "id" TEXT NOT NULL,
  "isoAlpha2" CHAR(2) NOT NULL,
  "isoAlpha3" CHAR(3) NOT NULL,
  "isoNumeric" CHAR(3) NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "lifecycle" "CountryLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Country_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Country_iso_upper_ck" CHECK ("isoAlpha2" = upper("isoAlpha2") AND "isoAlpha3" = upper("isoAlpha3")),
  CONSTRAINT "Country_numeric_ck" CHECK ("isoNumeric" ~ '^[0-9]{3}$')
);

CREATE UNIQUE INDEX "Country_isoAlpha2_key" ON "Country"("isoAlpha2");
CREATE UNIQUE INDEX "Country_isoAlpha3_key" ON "Country"("isoAlpha3");
CREATE UNIQUE INDEX "Country_isoNumeric_key" ON "Country"("isoNumeric");
CREATE INDEX "Country_lifecycle_isoAlpha2_idx" ON "Country"("lifecycle", "isoAlpha2");

CREATE TABLE "Market" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "status" "MarketStatus" NOT NULL DEFAULT 'DISABLED',
  "currencyCode" CHAR(3) NOT NULL,
  "defaultLocale" TEXT NOT NULL,
  "supportedLocales" TEXT[] NOT NULL,
  "timezonePolicy" JSONB NOT NULL,
  "capabilities" JSONB NOT NULL,
  "currentPolicyVersion" INTEGER,
  "effectiveAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Market_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Market_code_ck" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{1,15}$'),
  CONSTRAINT "Market_currency_ck" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Market_locales_ck" CHECK (cardinality("supportedLocales") BETWEEN 1 AND 20 AND "defaultLocale" = ANY("supportedLocales")),
  CONSTRAINT "Market_lifecycle_dates_ck" CHECK (("status" <> 'ACTIVE') OR "effectiveAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "Market_code_key" ON "Market"("code");
CREATE UNIQUE INDEX "Market_countryId_code_key" ON "Market"("countryId", "code");
CREATE UNIQUE INDEX "Market_id_countryId_key" ON "Market"("id", "countryId");
CREATE INDEX "Market_status_effectiveAt_idx" ON "Market"("status", "effectiveAt");
CREATE INDEX "Market_countryId_status_idx" ON "Market"("countryId", "status");
ALTER TABLE "Market" ADD CONSTRAINT "Market_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketPolicyVersion" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "MarketPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "identityPolicy" JSONB NOT NULL,
  "geographyPolicy" JSONB NOT NULL,
  "addressPolicy" JSONB NOT NULL,
  "localePolicy" JSONB NOT NULL,
  "currencyPolicy" JSONB NOT NULL,
  "legalPolicyReferences" JSONB NOT NULL,
  "taxPolicyReference" JSONB,
  "paymentPolicyReference" JSONB,
  "schemaDigest" TEXT NOT NULL,
  "reviewStatus" "LegalReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewReference" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "effectiveAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketPolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketPolicyVersion_version_ck" CHECK ("version" > 0),
  CONSTRAINT "MarketPolicyVersion_digest_ck" CHECK ("schemaDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MarketPolicyVersion_active_ck" CHECK (("status" <> 'ACTIVE') OR ("effectiveAt" IS NOT NULL AND "reviewStatus" = 'APPROVED'))
);

CREATE UNIQUE INDEX "MarketPolicyVersion_marketId_version_key" ON "MarketPolicyVersion"("marketId", "version");
CREATE INDEX "MarketPolicyVersion_marketId_status_effectiveAt_idx" ON "MarketPolicyVersion"("marketId", "status", "effectiveAt");
CREATE INDEX "MarketPolicyVersion_schemaDigest_idx" ON "MarketPolicyVersion"("schemaDigest");
ALTER TABLE "MarketPolicyVersion" ADD CONSTRAINT "MarketPolicyVersion_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GeographyDatasetImport" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "referenceDate" TIMESTAMP(3) NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "status" "GeographyImportStatus" NOT NULL DEFAULT 'PENDING',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "deprecatedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCategory" TEXT,
  "evidence" JSONB,
  "requestId" TEXT,
  "correlationId" TEXT,
  "traceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GeographyDatasetImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeographyDatasetImport_checksum_ck" CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "GeographyDatasetImport_counts_ck" CHECK ("rowCount" >= 0 AND "insertedCount" >= 0 AND "updatedCount" >= 0 AND "deprecatedCount" >= 0)
);

CREATE UNIQUE INDEX "GeographyDatasetImport_country_source_version_checksum_key" ON "GeographyDatasetImport"("countryId", "sourceKey", "sourceVersion", "checksumSha256");
CREATE INDEX "GeographyDatasetImport_country_source_status_created_idx" ON "GeographyDatasetImport"("countryId", "sourceKey", "status", "createdAt");
CREATE INDEX "GeographyDatasetImport_correlationId_idx" ON "GeographyDatasetImport"("correlationId");
ALTER TABLE "GeographyDatasetImport" ADD CONSTRAINT "GeographyDatasetImport_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdministrativeDivision" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "parentId" TEXT,
  "level" INTEGER NOT NULL,
  "typeKey" TEXT NOT NULL,
  "canonicalCode" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "displayNames" JSONB,
  "lifecycle" "AdministrativeDivisionLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "sourceKey" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "deprecatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdministrativeDivision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdministrativeDivision_level_ck" CHECK ("level" BETWEEN 1 AND 12),
  CONSTRAINT "AdministrativeDivision_type_ck" CHECK ("typeKey" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "AdministrativeDivision_code_ck" CHECK (length("canonicalCode") BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX "AdministrativeDivision_country_source_code_key" ON "AdministrativeDivision"("countryId", "sourceKey", "canonicalCode");
CREATE UNIQUE INDEX "AdministrativeDivision_id_countryId_key" ON "AdministrativeDivision"("id", "countryId");
CREATE INDEX "AdministrativeDivision_country_parent_level_lifecycle_idx" ON "AdministrativeDivision"("countryId", "parentId", "level", "lifecycle");
CREATE INDEX "AdministrativeDivision_country_type_name_idx" ON "AdministrativeDivision"("countryId", "typeKey", "canonicalName");
CREATE INDEX "AdministrativeDivision_lastImportId_idx" ON "AdministrativeDivision"("lastImportId");
ALTER TABLE "AdministrativeDivision" ADD CONSTRAINT "AdministrativeDivision_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdministrativeDivision" ADD CONSTRAINT "AdministrativeDivision_parent_country_fkey" FOREIGN KEY ("parentId", "countryId") REFERENCES "AdministrativeDivision"("id", "countryId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdministrativeDivision" ADD CONSTRAINT "AdministrativeDivision_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "GeographyDatasetImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdministrativeDivisionChange" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "changeType" "GeographyChangeType" NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdministrativeDivisionChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdministrativeDivisionChange_importId_changeType_idx" ON "AdministrativeDivisionChange"("importId", "changeType");
CREATE INDEX "AdministrativeDivisionChange_divisionId_createdAt_idx" ON "AdministrativeDivisionChange"("divisionId", "createdAt");
ALTER TABLE "AdministrativeDivisionChange" ADD CONSTRAINT "AdministrativeDivisionChange_importId_fkey" FOREIGN KEY ("importId") REFERENCES "GeographyDatasetImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdministrativeDivisionChange" ADD CONSTRAINT "AdministrativeDivisionChange_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Address" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "marketId" TEXT,
  "countryId" TEXT NOT NULL,
  "purpose" "AddressPurpose" NOT NULL,
  "line1" TEXT,
  "line2" TEXT,
  "locality" TEXT,
  "postalCode" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "validationStatus" "AddressValidationStatus" NOT NULL DEFAULT 'UNVALIDATED',
  "validationSource" TEXT,
  "validatedAt" TIMESTAMP(3),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Address_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Address_lines_ck" CHECK (length(coalesce("line1", '')) <= 200 AND length(coalesce("line2", '')) <= 200 AND length(coalesce("locality", '')) <= 120 AND length(coalesce("postalCode", '')) <= 32),
  CONSTRAINT "Address_coordinates_ck" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
);
CREATE INDEX "Address_userId_purpose_isPrimary_idx" ON "Address"("userId", "purpose", "isPrimary");
CREATE INDEX "Address_marketId_idx" ON "Address"("marketId");
CREATE INDEX "Address_countryId_postalCode_idx" ON "Address"("countryId", "postalCode");
CREATE UNIQUE INDEX "Address_one_primary_per_purpose_key" ON "Address"("userId", "purpose") WHERE "isPrimary" = true;
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_market_country_fkey" FOREIGN KEY ("marketId", "countryId") REFERENCES "Market"("id", "countryId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AddressAdministrativeDivision" (
  "addressId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AddressAdministrativeDivision_pkey" PRIMARY KEY ("addressId", "divisionId"),
  CONSTRAINT "AddressAdministrativeDivision_level_ck" CHECK ("level" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "AddressAdministrativeDivision_addressId_level_key" ON "AddressAdministrativeDivision"("addressId", "level");
CREATE INDEX "AddressAdministrativeDivision_divisionId_idx" ON "AddressAdministrativeDivision"("divisionId");
ALTER TABLE "AddressAdministrativeDivision" ADD CONSTRAINT "AddressAdministrativeDivision_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AddressAdministrativeDivision" ADD CONSTRAINT "AddressAdministrativeDivision_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProfessionalServiceArea" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "kind" "ProfessionalServiceAreaKind" NOT NULL DEFAULT 'ADMINISTRATIVE_DIVISION',
  "lifecycle" "ProfessionalServiceAreaLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfessionalServiceArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalServiceArea_f8_5_kind_ck" CHECK ("kind" = 'ADMINISTRATIVE_DIVISION')
);
CREATE UNIQUE INDEX "ProfessionalServiceArea_professional_market_division_kind_key" ON "ProfessionalServiceArea"("professionalId", "marketId", "divisionId", "kind");
CREATE INDEX "ProfessionalServiceArea_market_division_lifecycle_idx" ON "ProfessionalServiceArea"("marketId", "divisionId", "lifecycle");
CREATE INDEX "ProfessionalServiceArea_professional_lifecycle_idx" ON "ProfessionalServiceArea"("professionalId", "lifecycle");
ALTER TABLE "ProfessionalServiceArea" ADD CONSTRAINT "ProfessionalServiceArea_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceArea" ADD CONSTRAINT "ProfessionalServiceArea_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalServiceArea" ADD CONSTRAINT "ProfessionalServiceArea_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "AdministrativeDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IdentityDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "typeKey" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "lookupDigest" TEXT NOT NULL,
  "maskedValue" TEXT NOT NULL,
  "formatStatus" "IdentityFormatStatus" NOT NULL DEFAULT 'UNCHECKED',
  "verificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verificationMethod" TEXT,
  "verificationSource" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "lifecycle" "IdentityDocumentLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityDocument_type_ck" CHECK ("typeKey" ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  CONSTRAINT "IdentityDocument_digest_ck" CHECK ("lookupDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "IdentityDocument_mask_ck" CHECK (length("maskedValue") BETWEEN 4 AND 32),
  CONSTRAINT "IdentityDocument_verification_ck" CHECK (("verificationStatus" <> 'VERIFIED') OR ("verifiedAt" IS NOT NULL AND "verificationMethod" IS NOT NULL AND "verificationSource" IS NOT NULL))
);
CREATE INDEX "IdentityDocument_user_lifecycle_created_idx" ON "IdentityDocument"("userId", "lifecycle", "createdAt");
CREATE INDEX "IdentityDocument_market_type_lifecycle_idx" ON "IdentityDocument"("marketId", "typeKey", "lifecycle");
CREATE INDEX "IdentityDocument_country_type_digest_idx" ON "IdentityDocument"("countryId", "typeKey", "lookupDigest");
CREATE UNIQUE INDEX "IdentityDocument_active_identity_key" ON "IdentityDocument"("countryId", "typeKey", "lookupDigest") WHERE "lifecycle" = 'ACTIVE';
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_market_country_fkey" FOREIGN KEY ("marketId", "countryId") REFERENCES "Market"("id", "countryId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReferralProgramVersionMarket" (
  "programVersionId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralProgramVersionMarket_pkey" PRIMARY KEY ("programVersionId", "marketId")
);
CREATE INDEX "ReferralProgramVersionMarket_marketId_idx" ON "ReferralProgramVersionMarket"("marketId");
ALTER TABLE "ReferralProgramVersionMarket" ADD CONSTRAINT "ReferralProgramVersionMarket_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ReferralProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralProgramVersionMarket" ADD CONSTRAINT "ReferralProgramVersionMarket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "marketId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "marketId" TEXT, ADD COLUMN "addressId" TEXT;
ALTER TABLE "MarketingEvent" ADD COLUMN "marketId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "marketId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "marketId" TEXT;
ALTER TABLE "ConsentPolicy" ADD COLUMN "marketId" TEXT;
ALTER TABLE "Referral" ADD COLUMN "marketId" TEXT;
ALTER TABLE "PricingPolicy" ADD COLUMN "marketId" TEXT;
ALTER TABLE "RefundPolicy" ADD COLUMN "marketId" TEXT;

CREATE INDEX "User_marketId_idx" ON "User"("marketId");
CREATE INDEX "Booking_marketId_status_scheduledDate_idx" ON "Booking"("marketId", "status", "scheduledDate");
CREATE INDEX "Booking_addressId_idx" ON "Booking"("addressId");
CREATE INDEX "MarketingEvent_marketId_occurredAt_idx" ON "MarketingEvent"("marketId", "occurredAt");
CREATE INDEX "Campaign_marketId_status_idx" ON "Campaign"("marketId", "status");
CREATE INDEX "Lead_marketId_firstSeenAt_idx" ON "Lead"("marketId", "firstSeenAt");
CREATE INDEX "ConsentPolicy_marketId_purpose_status_effectiveAt_idx" ON "ConsentPolicy"("marketId", "purpose", "status", "effectiveAt");
CREATE INDEX "Referral_marketId_status_createdAt_idx" ON "Referral"("marketId", "status", "createdAt");
CREATE INDEX "PricingPolicy_marketId_status_effectiveAt_idx" ON "PricingPolicy"("marketId", "status", "effectiveAt");
CREATE INDEX "RefundPolicy_marketId_status_effectiveAt_idx" ON "RefundPolicy"("marketId", "status", "effectiveAt");

ALTER TABLE "User" ADD CONSTRAINT "User_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentPolicy" ADD CONSTRAINT "ConsentPolicy_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingPolicy" ADD CONSTRAINT "PricingPolicy_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundPolicy" ADD CONSTRAINT "RefundPolicy_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial configuration is deliberately DISABLED. Policy rows are draft/unreviewed.
INSERT INTO "Country" ("id", "isoAlpha2", "isoAlpha3", "isoNumeric", "canonicalName", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', 'ES', 'ESP', '724', 'Spain', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'BR', 'BRA', '076', 'Brazil', CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'CL', 'CHL', '152', 'Chile', CURRENT_TIMESTAMP);

INSERT INTO "Market" ("id", "code", "countryId", "status", "currencyCode", "defaultLocale", "supportedLocales", "timezonePolicy", "capabilities", "currentPolicyVersion", "updatedAt") VALUES
  ('20000000-0000-4000-8000-000000000001', 'ES', '10000000-0000-4000-8000-000000000001', 'DISABLED', 'EUR', 'es-ES', ARRAY['es-ES','en'], '{"mode":"IANA_BY_DIVISION","fallback":"Europe/Madrid"}', '{"registration":true,"professionalServiceAreas":true}', 1, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000002', 'BR', '10000000-0000-4000-8000-000000000002', 'DISABLED', 'BRL', 'pt-BR', ARRAY['pt-BR','en'], '{"mode":"IANA_BY_DIVISION","fallback":"America/Sao_Paulo"}', '{"registration":true,"professionalServiceAreas":true}', 1, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000003', 'CL', '10000000-0000-4000-8000-000000000003', 'DISABLED', 'CLP', 'es-CL', ARRAY['es-CL','en'], '{"mode":"IANA_BY_DIVISION","fallback":"America/Santiago"}', '{"registration":true,"professionalServiceAreas":true}', 1, CURRENT_TIMESTAMP);

INSERT INTO "MarketPolicyVersion" ("id", "marketId", "version", "identityPolicy", "geographyPolicy", "addressPolicy", "localePolicy", "currencyPolicy", "legalPolicyReferences", "schemaDigest", "createdAt") VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '{"documentTypes":[{"type":"DNI","required":true,"labelKey":"identity.dni"},{"type":"NIE","required":true,"labelKey":"identity.nie"},{"type":"PASSPORT","required":true,"labelKey":"identity.passport"}],"selection":"ONE_OF"}', '{"levels":[{"type":"AUTONOMOUS_COMMUNITY","level":1},{"type":"PROVINCE","level":2},{"type":"MUNICIPALITY","level":3}],"source":"INE_ES"}', '{"fields":[{"key":"line1","required":true,"maxLength":200},{"key":"line2","required":false,"maxLength":200},{"key":"postalCode","required":true,"maxLength":16}],"coordinates":"OPTIONAL"}', '{"default":"es-ES","supported":["es-ES","en"]}', '{"currency":"EUR","authority":"F3"}', '[]', '523ac34d9e87cd666a1cb4d611fb382e2286d019660688c337b5f7c7088f1417', CURRENT_TIMESTAMP),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 1, '{"documentTypes":[{"type":"CPF","required":true,"labelKey":"identity.cpf"}],"selection":"ONE_OF"}', '{"levels":[{"type":"FEDERATIVE_UNIT","level":1},{"type":"MUNICIPALITY","level":2}],"source":"IBGE_DTB"}', '{"fields":[{"key":"line1","required":true,"maxLength":200},{"key":"line2","required":false,"maxLength":200},{"key":"postalCode","required":true,"maxLength":16}],"coordinates":"OPTIONAL"}', '{"default":"pt-BR","supported":["pt-BR","en"]}', '{"currency":"BRL","authority":"F3"}', '[]', 'cc4afff315aaf24ce3076d820c28688fabc3936bb5a4dea9b030306f3561ea1e', CURRENT_TIMESTAMP),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 1, '{"documentTypes":[{"type":"RUN","aliases":["RUT"],"required":true,"labelKey":"identity.run"}],"selection":"ONE_OF"}', '{"levels":[{"type":"REGION","level":1},{"type":"PROVINCE","level":2},{"type":"COMMUNE","level":3}],"source":"INE_CL_SUBDERE"}', '{"fields":[{"key":"line1","required":true,"maxLength":200},{"key":"line2","required":false,"maxLength":200},{"key":"postalCode","required":false,"maxLength":16}],"coordinates":"OPTIONAL"}', '{"default":"es-CL","supported":["es-CL","en"]}', '{"currency":"CLP","authority":"F3"}', '[]', '473a20645d68721e61fec38efe158da94ba93315e4ca40ee0d9b809b914166ef', CURRENT_TIMESTAMP);

-- Compatibility backfill: the legacy system used one country code as one market.
UPDATE "User" AS u SET "marketId" = m."id" FROM "Market" AS m WHERE u."marketId" IS NULL AND upper(u."countryCode") = m."code";
UPDATE "Referral" AS r SET "marketId" = m."id" FROM "Market" AS m WHERE r."marketId" IS NULL AND upper(r."market") = m."code";
UPDATE "Campaign" AS c SET "marketId" = m."id" FROM "Market" AS m WHERE c."marketId" IS NULL AND upper(c."countryCode") = m."code";
UPDATE "Lead" AS l SET "marketId" = m."id" FROM "Market" AS m WHERE l."marketId" IS NULL AND upper(l."countryCode") = m."code";
UPDATE "MarketingEvent" AS e SET "marketId" = m."id" FROM "Market" AS m WHERE e."marketId" IS NULL AND upper(e."countryCode") = m."code";
UPDATE "ConsentPolicy" AS p SET "marketId" = m."id" FROM "Market" AS m WHERE p."marketId" IS NULL AND upper(p."countryCode") = m."code";
UPDATE "PricingPolicy" AS p SET "marketId" = m."id" FROM "Market" AS m WHERE p."marketId" IS NULL AND upper(p."country") = m."code";
UPDATE "RefundPolicy" AS p SET "marketId" = m."id" FROM "Market" AS m WHERE p."marketId" IS NULL AND upper(p."country") = m."code";
UPDATE "Booking" AS b SET "marketId" = u."marketId" FROM "ClientProfile" AS cp JOIN "User" AS u ON u."id" = cp."userId" WHERE b."clientId" = cp."id" AND b."marketId" IS NULL AND u."marketId" IS NOT NULL;

INSERT INTO "ReferralProgramVersionMarket" ("programVersionId", "marketId")
SELECT v."id", m."id" FROM "ReferralProgramVersion" AS v JOIN "Market" AS m ON m."code" = ANY(v."enabledMarkets")
ON CONFLICT ("programVersionId", "marketId") DO NOTHING;

INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES
  ('41000000-0000-4000-8000-000000000001', 'markets.read', 'Read market configuration and lifecycle', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000002', 'markets.manage', 'Manage reviewed market configuration and lifecycle', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000003', 'geography.read', 'Read geography imports and canonical divisions', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000004', 'geography.manage', 'Run controlled official geography imports', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000005', 'identity.policy.read', 'Read identity policy metadata', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000006', 'identity.policy.manage', 'Manage reviewed identity policy metadata', CURRENT_TIMESTAMP),
  ('41000000-0000-4000-8000-000000000007', 'identity.documents.read.masked', 'Read masked identity document metadata', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- F8.5 tables are service-role-only and default deny to PostgreSQL/Supabase API roles.
ALTER TABLE "Country" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Country" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Market" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Market" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MarketPolicyVersion" ENABLE ROW LEVEL SECURITY; ALTER TABLE "MarketPolicyVersion" FORCE ROW LEVEL SECURITY;
ALTER TABLE "GeographyDatasetImport" ENABLE ROW LEVEL SECURITY; ALTER TABLE "GeographyDatasetImport" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AdministrativeDivision" ENABLE ROW LEVEL SECURITY; ALTER TABLE "AdministrativeDivision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AdministrativeDivisionChange" ENABLE ROW LEVEL SECURITY; ALTER TABLE "AdministrativeDivisionChange" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Address" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AddressAdministrativeDivision" ENABLE ROW LEVEL SECURITY; ALTER TABLE "AddressAdministrativeDivision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProfessionalServiceArea" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ProfessionalServiceArea" FORCE ROW LEVEL SECURITY;
ALTER TABLE "IdentityDocument" ENABLE ROW LEVEL SECURITY; ALTER TABLE "IdentityDocument" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReferralProgramVersionMarket" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ReferralProgramVersionMarket" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Country", "Market", "MarketPolicyVersion", "GeographyDatasetImport", "AdministrativeDivision", "AdministrativeDivisionChange", "Address", "AddressAdministrativeDivision", "ProfessionalServiceArea", "IdentityDocument", "ReferralProgramVersionMarket" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Country", "Market", "MarketPolicyVersion", "GeographyDatasetImport", "AdministrativeDivision", "AdministrativeDivisionChange", "Address", "AddressAdministrativeDivision", "ProfessionalServiceArea", "IdentityDocument", "ReferralProgramVersionMarket" FROM authenticated;
  END IF;
END $$;
