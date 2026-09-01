const express = require('express');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');
const { getReadiness } = require('../modules/observability/health.service');
const { metricsHandler } = require('../modules/observability/metrics');
const {
  addIncidentComment,
  transitionErrorGroup,
  transitionIncident,
} = require('../modules/observability/incident-lifecycle.service');
const { z } = require('zod');

const router = express.Router();
router.use(authenticate);

router.get('/health', requirePermission(PERMISSIONS.DASHBOARD_READ), async (req, res) => {
  const health = await getReadiness(prisma, { persist: true });
  res.status(health.status === 'OUTAGE' ? 503 : 200).json(health);
});

router.get('/metrics', requirePermission(PERMISSIONS.DASHBOARD_READ), metricsHandler);

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);
const idSchema = z.string().min(1).max(128);
const reasonSchema = z.string().trim().min(3).max(2_000);

router.get('/health/snapshots', requirePermission(PERMISSIONS.DASHBOARD_READ), async (req, res) => {
  const query = z.object({ limit: limitSchema, service: z.string().trim().max(100).optional() }).parse(req.query);
  const snapshots = await prisma.serviceHealthSnapshot.findMany({
    where: query.service ? { service: query.service } : undefined,
    take: query.limit,
    orderBy: { checkedAt: 'desc' },
  });
  res.json({ snapshots });
});

router.get('/errors', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const query = z.object({
    limit: limitSchema,
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED']).optional(),
    severity: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
    service: z.string().trim().max(100).optional(),
  }).parse(req.query);
  const errorGroups = await prisma.errorGroup.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.service ? { service: query.service } : {}),
    },
    take: query.limit,
    orderBy: { lastSeenAt: 'desc' },
    include: { _count: { select: { events: true, incidents: true } } },
  });
  res.json({ errorGroups });
});

router.get('/errors/:id', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const errorGroup = await prisma.errorGroup.findUnique({
    where: { id },
    include: {
      events: {
        take: 100,
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true, severity: true, occurredAt: true, endpoint: true, method: true,
          requestId: true, correlationId: true, traceId: true, appVersion: true,
        },
      },
      incidents: { take: 20, orderBy: { detectedAt: 'desc' } },
    },
  });
  if (!errorGroup) return res.status(404).json({ error: 'Error group not found', code: 'ERROR_GROUP_NOT_FOUND' });
  return res.json({ errorGroup });
});

router.patch('/errors/:id/status', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const input = z.object({
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED']),
    reason: reasonSchema,
  }).parse(req.body);
  const result = await transitionErrorGroup({
    errorGroupId: idSchema.parse(req.params.id),
    toStatus: input.status,
    actorId: req.user.id,
    reason: input.reason,
    context: req.context,
  });
  res.json(result);
});

router.get('/incidents', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const query = z.object({
    limit: limitSchema,
    status: z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED']).optional(),
    severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  }).parse(req.query);
  const incidents = await prisma.incident.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
    },
    take: query.limit,
    orderBy: { detectedAt: 'desc' },
    include: { errorGroup: true, _count: { select: { events: true, comments: true } } },
  });
  res.json({ incidents });
});

router.get('/incidents/:id', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: idSchema.parse(req.params.id) },
    include: {
      errorGroup: true,
      events: { take: 200, orderBy: { createdAt: 'desc' } },
      comments: { take: 200, orderBy: { createdAt: 'desc' }, select: { id: true, authorId: true, body: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!incident) return res.status(404).json({ error: 'Incident not found', code: 'INCIDENT_NOT_FOUND' });
  return res.json({ incident });
});

router.patch('/incidents/:id/status', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const input = z.object({
    status: z.enum(['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED']),
    reason: reasonSchema,
  }).parse(req.body);
  const result = await transitionIncident({
    incidentId: idSchema.parse(req.params.id),
    toStatus: input.status,
    actorId: req.user.id,
    reason: input.reason,
    context: req.context,
  });
  res.json(result);
});

router.post('/incidents/:id/comments', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const input = z.object({ body: z.string().trim().min(1).max(5_000) }).parse(req.body);
  const comment = await addIncidentComment({
    incidentId: idSchema.parse(req.params.id),
    actorId: req.user.id,
    body: input.body,
    context: req.context,
  });
  res.status(201).json({ comment });
});

router.get('/audit', requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
  const query = z.object({
    limit: limitSchema,
    correlationId: z.string().trim().max(128).optional(),
    resourceType: z.string().trim().max(100).optional(),
  }).parse(req.query);
  const records = await prisma.auditLog.findMany({
    where: {
      ...(query.correlationId ? { correlationId: query.correlationId } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
    },
    take: query.limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, actorId: true, action: true, resourceType: true, resourceId: true,
      outcome: true, reason: true, before: true, after: true, requestId: true,
      correlationId: true, traceId: true, metadata: true, createdAt: true,
    },
  });
  res.json({ records });
});

module.exports = router;
