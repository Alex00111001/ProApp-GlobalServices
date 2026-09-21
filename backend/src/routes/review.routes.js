const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { responseContract } = require('../shared/http/response-contract');
const { reviewResponses } = require('../contracts/review.responses');

// Public only exposes moderated reviews for approved, active professionals.
router.get('/professional/:professionalId', responseContract(reviewResponses.professional), reviewController.getProfessionalReviews);

router.post('/', authenticate, authorize('CLIENT'), responseContract(reviewResponses.create), reviewController.createReview);
router.put('/:reviewId/respond', authenticate, authorize('PROFESSIONAL'), responseContract(reviewResponses.respond), reviewController.respondToReview);
router.get('/my-reviews', authenticate, authorize('PROFESSIONAL'), responseContract(reviewResponses.mine), reviewController.getMyReviews);

module.exports = router;
