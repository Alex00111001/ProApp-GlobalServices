const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/referral.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const mutationLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
router.use(authenticate);
router.get('/programs', controller.programs);
router.get('/codes', controller.codes);
router.post('/codes', mutationLimiter, controller.createCode);
router.post('/codes/:id/revoke', mutationLimiter, controller.revokeCode);
router.post('/claims', mutationLimiter, controller.claim);
router.get('/me', controller.mine);

module.exports = router;
