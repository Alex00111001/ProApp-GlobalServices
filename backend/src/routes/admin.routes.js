const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const adminRefundController = require('../controllers/admin-refund.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');

// Authentication is common; each operation declares its own permission.
router.use(authenticate);

// Dashboard con KPIs
router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_READ), adminController.getDashboard);

// Gestión de documentos
router.get('/documents/pending', requirePermission(PERMISSIONS.PROFESSIONALS_REVIEW), adminController.getPendingDocuments);
router.post('/documents/:id/approve', requirePermission(PERMISSIONS.PROFESSIONALS_REVIEW), adminController.approveDocument);
router.post('/documents/:id/reject', requirePermission(PERMISSIONS.PROFESSIONALS_REVIEW), adminController.rejectDocument);

// Logs de auditoría
router.get('/audit-logs', requirePermission(PERMISSIONS.AUDIT_READ), adminController.getAuditLogs);

// Financial refund review. Provider execution is intentionally not exposed yet.
router.get('/refunds', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.listRefunds);
router.get('/refunds/:id', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.getRefund);
router.post('/refunds/:id/approve', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.approveRefund);
router.post('/refunds/:id/reject', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.rejectRefund);

module.exports = router;
