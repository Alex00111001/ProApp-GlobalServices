const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professional.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Rutas públicas
router.get('/', professionalController.getProfessionals);
router.get('/:id', professionalController.getProfessionalById);

// Rutas protegidas (profesional o admin)
router.put('/:id', authenticate, professionalController.updateProfessionalProfile);

// Rutas protegidas (solo admin)
router.post('/:id/approve', authenticate, authorize('ADMIN'), professionalController.approveProfessional);
router.post('/:id/reject', authenticate, authorize('ADMIN'), professionalController.rejectProfessional);

module.exports = router;
