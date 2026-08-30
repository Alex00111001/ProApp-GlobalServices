const parsePercentage = (name, value, fallback) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return parsed;
};

const productionValue = (name, developmentFallback) => {
  const value = process.env[name] || (process.env.NODE_ENV === 'production' ? '' : developmentFallback);
  if (!value) throw new Error(`${name} must be configured in production`);
  return value;
};

const professionalCommissionValue = process.env.PROFESSIONAL_COMMISSION_PERCENTAGE ||
  process.env.PLATFORM_FEE_PERCENTAGE ||
  productionValue('PROFESSIONAL_COMMISSION_PERCENTAGE', '0.10');
const PROFESSIONAL_COMMISSION_PERCENTAGE = parsePercentage(
  'PROFESSIONAL_COMMISSION_PERCENTAGE',
  professionalCommissionValue,
  '0.10'
);
const CLIENT_PLATFORM_FEE_PERCENTAGE = parsePercentage(
  'CLIENT_PLATFORM_FEE_PERCENTAGE',
  productionValue('CLIENT_PLATFORM_FEE_PERCENTAGE', '0'),
  '0'
);
const LEGAL_DOCUMENT_VERSION = productionValue('LEGAL_DOCUMENT_VERSION', '2026-08-30');
const PAYMENT_CURRENCY = productionValue('STRIPE_CURRENCY', 'eur').toLowerCase();

module.exports = { CLIENT_PLATFORM_FEE_PERCENTAGE, PROFESSIONAL_COMMISSION_PERCENTAGE, LEGAL_DOCUMENT_VERSION, PAYMENT_CURRENCY };
