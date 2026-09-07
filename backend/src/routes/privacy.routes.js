const express = require('express');
const controller = require('../controllers/privacy.controller');
const { authenticate, authenticateOptional } = require('../middleware/auth');

const router = express.Router();

router.get('/policies', controller.policies);
router.post('/identity-proofs', controller.issueProof);
router.post('/identity/reconcile', authenticate, controller.reconcile);
router.post('/consents', authenticateOptional, controller.decide);
router.get('/consents/history', authenticate, controller.history);
router.post('/consents/withdrawals', authenticateOptional, controller.withdraw);
router.post('/touchpoints', authenticateOptional, controller.touchpoint);
router.get('/attributions', authenticate, controller.attributions);

module.exports = router;
