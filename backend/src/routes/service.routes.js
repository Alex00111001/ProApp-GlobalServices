const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Rutas públicas
router.get('/', serviceController.getServices);
router.get('/:id', serviceController.getServiceById);
router.get('/professional/:professionalId', serviceController.getProfessionalServices);

// Rutas protegidas (requieren autenticación)
router.post('/', authenticate, serviceController.createService);
router.put('/:id', authenticate, serviceController.updateService);
router.delete('/:id', authenticate, serviceController.deleteService);

module.exports = router;
