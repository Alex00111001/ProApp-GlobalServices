const { z } = require('zod');
const { parseIdempotencyKey } = require('../modules/bookings/booking-creation.service');

// Client-visible header only. Auth/market/role/provider secrets are never public parameters.
const bookingIdempotencyWire = z.string().regex(/^\s*[A-Za-z0-9._:-]{16,128}\s*$/);
const bookingInputContext = Object.freeze({
  header: { name: 'idempotency-key', required: true, schema: bookingIdempotencyWire,
    parse: parseIdempotencyKey, classification: 'NORMALIZATION',
    runtimeExpression: "parseIdempotencyKey(req.get('idempotency-key'))",
    source: 'backend/src/controllers/booking.controller.js',
    evidence: ['backend/test/input-authority.test.js', 'backend/test/integration/booking-transition-postgres.test.js'] },
  derived: Object.freeze(['actorUserId', 'clientProfile', 'professionalProfile', 'marketId', 'currency', 'prices', 'commercialPolicy', 'permissions']),
  ignoredBodies: Object.freeze(['confirm', 'start', 'complete']),
});
module.exports = { bookingIdempotencyWire, bookingInputContext };
