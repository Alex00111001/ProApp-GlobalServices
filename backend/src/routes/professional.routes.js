const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professional.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');

// Rutas públicas
router.get('/', professionalController.getProfessionals);
router.get('/:id', professionalController.getProfessionalById);

// Rutas protegidas (profesional o admin)
router.put('/:id', authenticate, professionalController.updateProfessionalProfile);

// Rutas protegidas (solo admin)
router.post('/:id/approve', authenticate, requirePermission(PERMISSIONS.PROFESSIONALS_REVIEW), professionalController.approveProfessional);
router.post('/:id/reject', authenticate, requirePermission(PERMISSIONS.PROFESSIONALS_REVIEW), professionalController.rejectProfessional);

module.exports = router;
