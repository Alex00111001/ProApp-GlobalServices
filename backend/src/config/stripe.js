const Stripe = require('stripe');

const apiVersion = process.env.STRIPE_API_VERSION || '2026-07-29.dahlia';
const apiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || 'sk_test_not_configured';

module.exports = new Stripe(apiKey, {
  apiVersion,
  appInfo: { name: 'ProApp GlobalServices', version: '1.0.0' },
});
