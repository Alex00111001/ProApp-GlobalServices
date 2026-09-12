-- Expand existing Booking scheduling evidence without deleting legacy data.
-- Historical rows are backfilled from their snapshotted service quantities and
-- current service duration. The fallback only covers already-invalid legacy rows
-- that have no BookingService evidence.
WITH booking_duration AS (
  SELECT
    bs."bookingId",
    GREATEST(SUM(s."duration" * bs."quantity"), 1)::integer AS duration_minutes
  FROM "BookingService" bs
  JOIN "Service" s ON s."id" = bs."serviceId"
  GROUP BY bs."bookingId"
)
UPDATE "Booking" b
SET "endDate" = b."scheduledDate" + make_interval(mins => COALESCE(d.duration_minutes, 60))
FROM booking_duration d
WHERE b."id" = d."bookingId"
  AND b."endDate" IS NULL;

UPDATE "Booking"
SET "endDate" = "scheduledDate" + interval '60 minutes'
WHERE "endDate" IS NULL;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_scheduling_window_valid"
  CHECK ("endDate" IS NOT NULL AND "endDate" > "scheduledDate");

CREATE INDEX "Booking_professional_status_schedule_idx"
  ON "Booking"("professionalId", "status", "scheduledDate", "endDate");
