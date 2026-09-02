const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/admin-v1.controller');
const authController = require('../controllers/admin-auth.controller');
const operationsController = require('../controllers/admin-operations.controller');
const { authenticateAdmin } = require('../middleware/authenticate-admin');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');
const { metricsHandler } = require('../modules/observability/metrics');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many administrative authentication attempts.',
    code: 'ADMIN_AUTH_RATE_LIMITED',
    correlationId: req.context?.correlationId,
  }),
});

router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', authLimiter, authController.refresh);

router.use(authenticateAdmin);
router.get('/auth/me', authController.me);
router.post('/auth/logout', authController.logout);
router.get('/auth/sessions', authController.listSessions);
router.post('/auth/sessions/:id/revoke', requirePermission(PERMISSIONS.SESSIONS_MANAGE), authController.revokeSession);

router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_READ), controller.dashboard);

router.get('/users', requirePermission(PERMISSIONS.USERS_READ), controller.users);
router.get('/users/:id', requirePermission(PERMISSIONS.USERS_PII_READ), controller.user);
router.patch('/users/:id/status', requirePermission(PERMISSIONS.USERS_MANAGE), controller.setUserStatus);

router.get('/professionals', requirePermission(PERMISSIONS.PROFESSIONALS_READ), controller.professionals);
router.get(
  '/professionals/:id',
  requirePermission(PERMISSIONS.PROFESSIONALS_READ),
  requirePermission(PERMISSIONS.USERS_PII_READ),
  controller.professional
);
router.patch('/professionals/:id/status', requirePermission(PERMISSIONS.PROFESSIONALS_MANAGE), controller.setProfessionalStatus);

router.get('/bookings', requirePermission(PERMISSIONS.BOOKINGS_READ), controller.bookings);
router.get(
  '/bookings/:id',
  requirePermission(PERMISSIONS.BOOKINGS_READ),
  requirePermission(PERMISSIONS.USERS_PII_READ),
  controller.booking
);

router.get('/audit', requirePermission(PERMISSIONS.AUDIT_READ), controller.auditLogs);
router.get('/roles', requirePermission(PERMISSIONS.ROLES_READ), controller.roles);
router.get('/role-change-requests', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.roleChangeRequests);
router.post('/role-change-requests', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.requestRoleChange);
router.post('/role-change-requests/:id/approve', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.approveRoleChange);
router.post('/role-change-requests/:id/reject', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.rejectRoleChange);

router.get('/operations/overview', requirePermission(PERMISSIONS.OPERATIONS_READ), operationsController.overview);
router.get('/operations/metrics', requirePermission(PERMISSIONS.OPERATIONS_READ), metricsHandler);
router.get('/operations/health', requirePermission(PERMISSIONS.HEALTH_READ), operationsController.health);
router.get('/operations/health/snapshots', requirePermission(PERMISSIONS.HEALTH_READ), operationsController.healthSnapshots);
router.get('/operations/errors', requirePermission(PERMISSIONS.ERRORS_READ), operationsController.errors);
router.get('/operations/errors/:id', requirePermission(PERMISSIONS.ERRORS_READ), operationsController.error);
router.patch('/operations/errors/:id/status', requirePermission(PERMISSIONS.ERRORS_MANAGE), operationsController.setErrorStatus);
router.get('/operations/incidents', requirePermission(PERMISSIONS.INCIDENTS_READ), operationsController.incidents);
router.get('/operations/incidents/:id', requirePermission(PERMISSIONS.INCIDENTS_READ), operationsController.incident);
router.patch('/operations/incidents/:id/status', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), operationsController.setIncidentStatus);
router.post('/operations/incidents/:id/comments', requirePermission(PERMISSIONS.INCIDENTS_MANAGE), operationsController.addIncidentComment);
router.get('/operations/jobs', requirePermission(PERMISSIONS.JOBS_READ), operationsController.jobs);
router.get('/operations/integrations', requirePermission(PERMISSIONS.INTEGRATIONS_READ), operationsController.integrations);
router.get('/operations/alerts', requirePermission(PERMISSIONS.ALERTS_READ), operationsController.alerts);
router.get('/operations/financial-monitoring', requirePermission(PERMISSIONS.FINANCIAL_MONITORING_READ), operationsController.financialMonitoring);
router.get('/operations/support/operators', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.supportOperators);
router.get('/operations/support/cases', requirePermission(PERMISSIONS.SUPPORT_READ), operationsController.supportCases);
router.post('/operations/support/cases', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.createSupportCase);
router.get('/operations/support/cases/:id', requirePermission(PERMISSIONS.SUPPORT_READ), operationsController.supportCase);
router.patch('/operations/support/cases/:id/status', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.setSupportCaseStatus);
router.patch('/operations/support/cases/:id/assignment', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.assignSupportCase);
router.post('/operations/support/cases/:id/comments', requirePermission(PERMISSIONS.SUPPORT_MANAGE), operationsController.addSupportComment);

module.exports = router;
