const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');
const { PostgresRateLimitStore } = require('./postgres-rate-limit-store');

const key = (purpose) => (req) => crypto
  .createHmac('sha256', env.customerSessionPepper)
  .update(`${purpose}:${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').trim().toLowerCase().slice(0, 320)}`)
  .digest('hex');

const buildLimiter = ({ purpose, limit }) => rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60_000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: key(purpose),
  store: new PostgresRateLimitStore({ prefix: `auth-${purpose}` }),
  passOnStoreError: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many authentication attempts. Try again later.',
    code: 'AUTH_RATE_LIMITED',
    correlationId: req.context?.correlationId,
  }),
});

const loginLimiter = buildLimiter({ purpose: 'login', limit: env.authLoginRateLimit });
const registerLimiter = buildLimiter({ purpose: 'register', limit: env.authRegisterRateLimit });
const recoveryLimiter = buildLimiter({ purpose: 'recovery', limit: 5 });
const verificationLimiter = buildLimiter({ purpose: 'verification', limit: 10 });

module.exports = { buildLimiter, loginLimiter, recoveryLimiter, registerLimiter, verificationLimiter };
