CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "LeadSubjectType" AS ENUM ('USER', 'PROFESSIONAL', 'ANONYMOUS', 'SESSION');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ENGAGED', 'CONVERTED', 'DISQUALIFIED');
CREATE TYPE "ConversionType" AS ENUM ('SIGNUP', 'REQUEST', 'BOOKING', 'PAYMENT', 'JOB_COMPLETED');

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "source" TEXT NOT NULL,
  "medium" TEXT,
  "channel" TEXT,
  "countryCode" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campaign_window_valid" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "Campaign_country_iso" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$')
);

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "subjectType" "LeadSubjectType" NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "userId" TEXT,
  "professionalId" TEXT,
  "campaignId" TEXT,
  "source" TEXT,
  "channel" TEXT,
  "countryCode" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lead_country_iso" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$')
);

ALTER TABLE "MarketingEvent"
  ADD COLUMN "clientEventId" TEXT,
  ADD COLUMN "subjectKey" TEXT,
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "leadId" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "traceId" TEXT;

ALTER TABLE "MarketingEvent"
  ADD CONSTRAINT "MarketingEvent_country_iso" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$');

CREATE TABLE "Conversion" (
  "id" TEXT NOT NULL,
  "conversionKey" TEXT NOT NULL,
  "type" "ConversionType" NOT NULL,
  "eventId" TEXT NOT NULL,
  "leadId" TEXT,
  "campaignId" TEXT,
  "userId" TEXT,
  "professionalId" TEXT,
  "bookingId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Campaign_key_key" ON "Campaign"("key");
CREATE INDEX "Campaign_status_startsAt_endsAt_idx" ON "Campaign"("status", "startsAt", "endsAt");
CREATE INDEX "Campaign_source_medium_createdAt_idx" ON "Campaign"("source", "medium", "createdAt");
CREATE INDEX "Campaign_countryCode_status_idx" ON "Campaign"("countryCode", "status");
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");
CREATE UNIQUE INDEX "Lead_subjectKey_key" ON "Lead"("subjectKey");
CREATE INDEX "Lead_status_lastSeenAt_idx" ON "Lead"("status", "lastSeenAt");
CREATE INDEX "Lead_campaignId_status_lastSeenAt_idx" ON "Lead"("campaignId", "status", "lastSeenAt");
CREATE INDEX "Lead_userId_lastSeenAt_idx" ON "Lead"("userId", "lastSeenAt");
CREATE INDEX "Lead_professionalId_lastSeenAt_idx" ON "Lead"("professionalId", "lastSeenAt");
CREATE INDEX "Lead_countryCode_firstSeenAt_idx" ON "Lead"("countryCode", "firstSeenAt");
CREATE UNIQUE INDEX "MarketingEvent_clientEventId_key" ON "MarketingEvent"("clientEventId");
CREATE INDEX "MarketingEvent_campaignId_occurredAt_idx" ON "MarketingEvent"("campaignId", "occurredAt");
CREATE INDEX "MarketingEvent_leadId_eventName_occurredAt_idx" ON "MarketingEvent"("leadId", "eventName", "occurredAt");
CREATE INDEX "MarketingEvent_countryCode_occurredAt_idx" ON "MarketingEvent"("countryCode", "occurredAt");
CREATE INDEX "MarketingEvent_correlationId_idx" ON "MarketingEvent"("correlationId");
CREATE UNIQUE INDEX "Conversion_conversionKey_key" ON "Conversion"("conversionKey");
CREATE UNIQUE INDEX "Conversion_eventId_key" ON "Conversion"("eventId");
CREATE INDEX "Conversion_type_occurredAt_idx" ON "Conversion"("type", "occurredAt");
CREATE INDEX "Conversion_campaignId_type_occurredAt_idx" ON "Conversion"("campaignId", "type", "occurredAt");
CREATE INDEX "Conversion_leadId_occurredAt_idx" ON "Conversion"("leadId", "occurredAt");
CREATE INDEX "Conversion_bookingId_occurredAt_idx" ON "Conversion"("bookingId", "occurredAt");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MarketingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Conversion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversion" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "Campaign", "Lead", "Conversion" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "Campaign", "Lead", "Conversion" FROM authenticated;
  END IF;
END
$$;
REVOKE ALL ON "Campaign", "Lead", "Conversion" FROM PUBLIC;
