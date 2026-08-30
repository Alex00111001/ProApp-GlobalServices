const express = require('express');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');
const { getSystemHealth } = require('../modules/observability/health.service');

const router = express.Router();
router.use(authenticate);

router.get('/health', requirePermission(PERMISSIONS.DASHBOARD_READ), async (req, res) => {
  const health = await getSystemHealth(prisma);
  res.status(health.status === 'OUTAGE' ? 503 : 200).json(health);
});

router.get('/errors', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const errors = await prisma.errorEvent.findMany({ take: 100, orderBy: { lastSeenAt: 'desc' } });
  res.json({ errors });
});

router.get('/incidents', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), async (req, res) => {
  const incidents = await prisma.incident.findMany({
    take: 100,
    orderBy: { detectedAt: 'desc' },
    include: { events: { take: 20, orderBy: { createdAt: 'desc' } } },
  });
  res.json({ incidents });
});

module.exports = router;
