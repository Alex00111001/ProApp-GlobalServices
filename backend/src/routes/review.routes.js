const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Public only exposes moderated reviews for approved, active professionals.
router.get('/professional/:professionalId', reviewController.getProfessionalReviews);

router.post('/', authenticate, authorize('CLIENT'), reviewController.createReview);
router.put('/:reviewId/respond', authenticate, authorize('PROFESSIONAL'), reviewController.respondToReview);
router.get('/my-reviews', authenticate, authorize('PROFESSIONAL'), reviewController.getMyReviews);

module.exports = router;
