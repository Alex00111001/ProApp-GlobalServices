const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/public-content.controller');
const router = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ error: 'Too many public content requests.', code: 'PUBLIC_CONTENT_RATE_LIMITED', correlationId: req.context?.correlationId }) });
router.get('/content/:marketCode/:locale/:type/:slug', limiter, controller.content);
router.get('/sitemap/:marketCode/:locale', limiter, controller.sitemap);
router.get('/redirect', limiter, controller.redirect);
module.exports = router;
