-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'OUTAGE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "environment" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "module" TEXT,
    "operation" TEXT,
    "errorCode" TEXT,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "httpStatus" INTEGER,
    "endpoint" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "professionalId" TEXT,
    "bookingId" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "traceId" TEXT,
    "appVersion" TEXT,
    "device" JSONB,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" "ErrorStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "service" TEXT,
    "assigneeId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "errorEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentComment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHealthSnapshot" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErrorEvent_fingerprint_key" ON "ErrorEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorEvent_severity_status_lastSeenAt_idx" ON "ErrorEvent"("severity", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorEvent_service_lastSeenAt_idx" ON "ErrorEvent"("service", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorEvent_correlationId_idx" ON "ErrorEvent"("correlationId");

-- CreateIndex
CREATE INDEX "ErrorEvent_bookingId_lastSeenAt_idx" ON "ErrorEvent"("bookingId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Incident_status_severity_detectedAt_idx" ON "Incident"("status", "severity", "detectedAt");

-- CreateIndex
CREATE INDEX "Incident_service_status_idx" ON "Incident"("service", "status");

-- CreateIndex
CREATE INDEX "IncidentEvent_incidentId_createdAt_idx" ON "IncidentEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentEvent_errorEventId_idx" ON "IncidentEvent"("errorEventId");

-- CreateIndex
CREATE INDEX "IncidentComment_incidentId_createdAt_idx" ON "IncidentComment"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentComment_authorId_idx" ON "IncidentComment"("authorId");

-- CreateIndex
CREATE INDEX "ServiceHealthSnapshot_service_checkedAt_idx" ON "ServiceHealthSnapshot"("service", "checkedAt");

-- CreateIndex
CREATE INDEX "ServiceHealthSnapshot_status_checkedAt_idx" ON "ServiceHealthSnapshot"("status", "checkedAt");

-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_errorEventId_fkey" FOREIGN KEY ("errorEventId") REFERENCES "ErrorEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentComment" ADD CONSTRAINT "IncidentComment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentComment" ADD CONSTRAINT "IncidentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
