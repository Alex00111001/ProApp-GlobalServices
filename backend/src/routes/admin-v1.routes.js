const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/admin-v1.controller');
const authController = require('../controllers/admin-auth.controller');
const { authenticateAdmin } = require('../middleware/authenticate-admin');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');

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

module.exports = router;
