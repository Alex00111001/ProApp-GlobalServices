const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Todas las rutas requieren autenticación y rol ADMIN
router.use(authenticate);
router.use(authorize('ADMIN'));

// Dashboard con KPIs
router.get('/dashboard', adminController.getDashboard);

// Gestión de documentos
router.get('/documents/pending', adminController.getPendingDocuments);
router.post('/documents/:id/approve', adminController.approveDocument);
router.post('/documents/:id/reject', adminController.rejectDocument);

// Logs de auditoría
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
