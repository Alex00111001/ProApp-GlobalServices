const EVENT_NAMES = Object.freeze([
  'app_opened', 'signup_started', 'signup_completed',
  'service_viewed', 'professional_viewed',
  'request_started', 'request_abandoned', 'request_created',
  'professional_matched', 'professional_contacted', 'job_accepted',
  'booking_created', 'booking_confirmed',
  'payment_started', 'payment_completed', 'payment_failed',
  'job_started', 'job_completed', 'review_created',
  'referral_created', 'referral_converted',
]);

const EVENT_NAME_SET = new Set(EVENT_NAMES);
const isKnownEvent = (name) => EVENT_NAME_SET.has(name);

module.exports = { EVENT_NAMES, isKnownEvent };
