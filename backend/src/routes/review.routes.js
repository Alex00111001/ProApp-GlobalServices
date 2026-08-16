const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener reviews de un profesional (pública)
router.get('/professional/:professionalId', reviewController.getProfessionalReviews);

// Crear una review para un profesional
router.post('/', reviewController.createReview);

// Responder a una review (solo profesional)
router.put('/:reviewId/respond', reviewController.respondToReview);

// Obtener mis reviews como profesional
router.get('/my-reviews', reviewController.getMyReviews);

module.exports = router;
