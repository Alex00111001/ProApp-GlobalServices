const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/experiments.controller');
const { authenticateOptional } = require('../middleware/auth');
const router = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: 'Too many experiment requests.', code: 'EXPERIMENT_RATE_LIMITED', correlationId: req.context?.correlationId }) });
router.post('/:key/assignments', limiter, authenticateOptional, controller.assign);
router.post('/:key/exposures', limiter, authenticateOptional, controller.expose);
module.exports = router;
