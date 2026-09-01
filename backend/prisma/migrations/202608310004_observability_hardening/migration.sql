-- Canonical error grouping keeps immutable occurrences separate from operational state.
CREATE TABLE "ErrorGroup" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
  "environment" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "module" TEXT,
  "operation" TEXT,
  "errorCode" TEXT,
  "normalizedMessage" TEXT NOT NULL,
  "status" "ErrorStatus" NOT NULL DEFAULT 'OPEN',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "windowOccurrenceCount" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ErrorGroup" (
  "id", "fingerprint", "severity", "environment", "service", "module", "operation",
  "errorCode", "normalizedMessage", "status", "firstSeenAt", "lastSeenAt",
  "occurrenceCount", "windowStartedAt", "windowOccurrenceCount"
)
SELECT
  md5("fingerprint"), "fingerprint", "severity", "environment", "service", "module", "operation",
  "errorCode", "message", "status", "firstSeenAt", "lastSeenAt",
  "occurrenceCount", "lastSeenAt", 1
FROM "ErrorEvent";

ALTER TABLE "ErrorEvent" ADD COLUMN "errorGroupId" TEXT;
UPDATE "ErrorEvent" SET "errorGroupId" = md5("fingerprint");
ALTER TABLE "ErrorEvent" ALTER COLUMN "errorGroupId" SET NOT NULL;
ALTER TABLE "ErrorEvent" RENAME COLUMN "firstSeenAt" TO "occurredAt";
ALTER TABLE "ErrorEvent" DROP COLUMN "lastSeenAt";
ALTER TABLE "ErrorEvent" DROP COLUMN "occurrenceCount";
ALTER TABLE "ErrorEvent" DROP COLUMN "status";

DROP INDEX "ErrorEvent_fingerprint_key";

CREATE UNIQUE INDEX "ErrorGroup_fingerprint_key" ON "ErrorGroup"("fingerprint");
CREATE INDEX "ErrorGroup_severity_status_lastSeenAt_idx" ON "ErrorGroup"("severity", "status", "lastSeenAt");
CREATE INDEX "ErrorGroup_service_lastSeenAt_idx" ON "ErrorGroup"("service", "lastSeenAt");
CREATE INDEX "ErrorGroup_severity_status_windowStartedAt_idx" ON "ErrorGroup"("severity", "status", "windowStartedAt");
CREATE INDEX "ErrorEvent_errorGroupId_occurredAt_idx" ON "ErrorEvent"("errorGroupId", "occurredAt");
CREATE INDEX "ErrorEvent_fingerprint_occurredAt_idx" ON "ErrorEvent"("fingerprint", "occurredAt");
CREATE INDEX "ErrorEvent_severity_occurredAt_idx" ON "ErrorEvent"("severity", "occurredAt");
CREATE INDEX "ErrorEvent_service_occurredAt_idx" ON "ErrorEvent"("service", "occurredAt");
CREATE INDEX "ErrorEvent_bookingId_occurredAt_idx" ON "ErrorEvent"("bookingId", "occurredAt");

ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_errorGroupId_fkey"
  FOREIGN KEY ("errorGroupId") REFERENCES "ErrorGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Incidents deduplicate by group and aggregation window, while preserving event evidence.
ALTER TABLE "Incident"
  ADD COLUMN "errorGroupId" TEXT,
  ADD COLUMN "deduplicationKey" TEXT;

UPDATE "Incident" AS incident
SET "errorGroupId" = source."errorGroupId"
FROM (
  SELECT DISTINCT ON (event."incidentId") event."incidentId", occurrence."errorGroupId"
  FROM "IncidentEvent" AS event
  JOIN "ErrorEvent" AS occurrence ON occurrence."id" = event."errorEventId"
  ORDER BY event."incidentId", event."createdAt" DESC
) AS source
WHERE incident."id" = source."incidentId";

CREATE UNIQUE INDEX "Incident_deduplicationKey_key" ON "Incident"("deduplicationKey");
CREATE INDEX "Incident_errorGroupId_detectedAt_idx" ON "Incident"("errorGroupId", "detectedAt");
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_errorGroupId_fkey"
  FOREIGN KEY ("errorGroupId") REFERENCES "ErrorGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Operational evidence is backend-only. Supabase public roles receive no policies.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ErrorGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ErrorEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceHealthSnapshot" ENABLE ROW LEVEL SECURITY;
