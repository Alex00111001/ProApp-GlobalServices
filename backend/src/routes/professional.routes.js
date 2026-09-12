const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professional.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Rutas públicas
router.get('/', professionalController.getProfessionals);
router.get('/:id', professionalController.getProfessionalById);

// Professional self-service. Administrative lifecycle changes use /api/v1/admin.
router.put('/:id', authenticate, authorize('PROFESSIONAL'), professionalController.updateProfessionalProfile);

module.exports = router;
