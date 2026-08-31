const express = require('express');
const { z } = require('zod');
const { authenticateOptional } = require('../middleware/auth');
const { trackEvent } = require('../modules/growth/events/event.service');

const router = express.Router();
const eventSchema = z.object({
  eventName: z.string().min(1).max(100),
  occurredAt: z.iso.datetime().optional(),
  bookingId: z.uuid().optional(),
  sessionId: z.string().max(128).optional(),
  anonymousId: z.string().max(128).optional(),
  source: z.string().max(64).optional(),
  channel: z.string().max(64).optional(),
  campaign: z.string().max(128).optional(),
  utm: z.object({
    source: z.string().max(128).optional(), medium: z.string().max(128).optional(),
    campaign: z.string().max(128).optional(), content: z.string().max(128).optional(),
    term: z.string().max(128).optional(),
  }).strict().optional(),
  device: z.record(z.string(), z.unknown()).optional(),
  appVersion: z.string().max(64).optional(),
  geography: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

router.post('/', authenticateOptional, async (req, res, next) => {
  try {
    const input = eventSchema.parse(req.body);
    const event = await trackEvent(input, {
      userId: req.user?.id,
      professionalId: req.user?.professionalProfile?.id,
    });
    res.status(202).json({ id: event.id, accepted: true });
  } catch (error) {
    if (error.name === 'ZodError' || error.code === 'UNKNOWN_EVENT' || error.code === 'METADATA_TOO_LARGE') {
      return res.status(400).json({
        error: error.name === 'ZodError' ? 'Validation error' : error.message,
        code: error.code || 'VALIDATION_ERROR',
        details: error.name === 'ZodError' ? error.issues : undefined,
      });
    }
    return next(error);
  }
});

module.exports = router;
