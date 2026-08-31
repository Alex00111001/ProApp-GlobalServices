const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const adminRefundController = require('../controllers/admin-refund.controller');
const adminPayoutController = require('../controllers/admin-payout.controller');
const adminFinancialController = require('../controllers/admin-financial.controller');
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

// Financial refund review and explicitly flagged provider execution.
router.get('/refunds', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.listRefunds);
router.get('/refunds/:id', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.getRefund);
router.post('/refunds/:id/approve', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.approveRefund);
router.post('/refunds/:id/reject', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.rejectRefund);
router.post('/refunds/:id/execute', requirePermission(PERMISSIONS.REFUNDS_MANAGE), adminRefundController.executeRefund);

// Financial payout review and explicitly flagged Stripe Connect execution.
router.get('/payouts', requirePermission(PERMISSIONS.PAYOUTS_MANAGE), adminPayoutController.listPayouts);
router.get('/payouts/:id', requirePermission(PERMISSIONS.PAYOUTS_MANAGE), adminPayoutController.getPayout);
router.post('/payouts/:id/approve', requirePermission(PERMISSIONS.PAYOUTS_MANAGE), adminPayoutController.approvePayout);
router.post('/payouts/:id/execute', requirePermission(PERMISSIONS.PAYOUTS_MANAGE), adminPayoutController.executePayout);

router.get('/disputes', requirePermission(PERMISSIONS.DISPUTES_READ), adminFinancialController.listDisputes);
router.get('/disputes/:id', requirePermission(PERMISSIONS.DISPUTES_READ), adminFinancialController.getDispute);
router.get('/reconciliation', requirePermission(PERMISSIONS.RECONCILIATION_RUN), adminFinancialController.listReconciliationRuns);
router.get('/reconciliation/:id', requirePermission(PERMISSIONS.RECONCILIATION_RUN), adminFinancialController.getReconciliationRun);
router.post('/reconciliation', requirePermission(PERMISSIONS.RECONCILIATION_RUN), adminFinancialController.runReconciliation);

module.exports = router;
