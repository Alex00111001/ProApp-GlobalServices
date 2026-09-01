-- Expand/contract compatibility for a temporary rollback to the pre-F2 application.
-- F2 treats these fields as immutable occurrence snapshots; ErrorGroup remains canonical.
ALTER TABLE "ErrorEvent"
  ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" "ErrorStatus" NOT NULL DEFAULT 'OPEN';

UPDATE "ErrorEvent" AS occurrence
SET
  "firstSeenAt" = occurrence."occurredAt",
  "lastSeenAt" = occurrence."occurredAt",
  "status" = grouped."status"
FROM "ErrorGroup" AS grouped
WHERE occurrence."errorGroupId" = grouped."id";

CREATE INDEX "ErrorEvent_severity_status_lastSeenAt_idx"
  ON "ErrorEvent"("severity", "status", "lastSeenAt");
CREATE INDEX "ErrorEvent_service_lastSeenAt_idx"
  ON "ErrorEvent"("service", "lastSeenAt");
CREATE INDEX "ErrorEvent_bookingId_lastSeenAt_idx"
  ON "ErrorEvent"("bookingId", "lastSeenAt");
