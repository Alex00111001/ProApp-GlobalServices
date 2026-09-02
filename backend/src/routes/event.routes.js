const express = require('express');
const { authenticateOptional } = require('../middleware/auth');
const { trackEvent } = require('../modules/growth/events/event.service');
const { eventSchema } = require('../validators/growth.validators');

const router = express.Router();

router.post('/', authenticateOptional, async (req, res, next) => {
  try {
    const input = eventSchema.parse(req.body);
    const result = await trackEvent(input, {
      userId: req.user?.id,
      professionalId: req.user?.professionalProfile?.id,
    }, undefined, req.context);
    res.status(202).json({ id: result.event.id, accepted: true, duplicate: result.duplicate });
  } catch (error) {
    if (error.name === 'ZodError' || ['UNKNOWN_EVENT', 'METADATA_TOO_LARGE', 'INVALID_EVENT_TIME', 'EVENT_TIME_IN_FUTURE', 'EVENT_TIME_TOO_OLD'].includes(error.code)) {
      return res.status(400).json({
        error: error.name === 'ZodError' ? 'Validation error' : error.message,
        code: error.code || 'VALIDATION_ERROR',
        details: error.name === 'ZodError' ? error.issues : undefined,
        correlationId: req.context?.correlationId,
      });
    }
    return next(error);
  }
});

module.exports = router;
