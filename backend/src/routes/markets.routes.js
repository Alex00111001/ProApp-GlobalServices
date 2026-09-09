const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/markets.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const publicReadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many market requests.', code: 'MARKET_RATE_LIMITED', correlationId: req.context?.correlationId }),
});
const identityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many identity requests.', code: 'IDENTITY_RATE_LIMITED', correlationId: req.context?.correlationId }),
});

router.get('/', publicReadLimiter, controller.markets);
router.get('/countries', publicReadLimiter, controller.countries);
router.get('/:marketCode/registration-schema', publicReadLimiter, controller.registrationSchema);
router.get('/:marketCode/divisions', publicReadLimiter, controller.divisions);
router.get('/me/identity-documents', authenticate, controller.identityDocuments);
router.post('/me/identity-documents', identityLimiter, authenticate, controller.createIdentityDocument);
router.get('/me/addresses', authenticate, controller.addresses);
router.post('/me/addresses', authenticate, controller.createAddress);
router.get('/me/professional-service-areas', authenticate, controller.serviceAreas);
router.post('/me/professional-service-areas', authenticate, controller.addServiceArea);

module.exports = router;
