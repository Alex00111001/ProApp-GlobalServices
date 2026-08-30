const parsePercentage = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) {
    throw new Error('PLATFORM_FEE_PERCENTAGE must be a number between 0 and 1');
  }
  return parsed;
};

const productionValue = (name, developmentFallback) => {
  const value = process.env[name] || (process.env.NODE_ENV === 'production' ? '' : developmentFallback);
  if (!value) throw new Error(`${name} must be configured in production`);
  return value;
};

const PLATFORM_FEE_PERCENTAGE = parsePercentage(productionValue('PLATFORM_FEE_PERCENTAGE', '0.10'));
const LEGAL_DOCUMENT_VERSION = productionValue('LEGAL_DOCUMENT_VERSION', '2026-08-30');
const PAYMENT_CURRENCY = productionValue('STRIPE_CURRENCY', 'eur').toLowerCase();

module.exports = { PLATFORM_FEE_PERCENTAGE, LEGAL_DOCUMENT_VERSION, PAYMENT_CURRENCY };
