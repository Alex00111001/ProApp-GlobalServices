const PLACEHOLDER_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'change-me',
  'secret',
]);

const environment = process.env.NODE_ENV || 'development';

const parseBoolean = (name, value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be either true or false.`);
};

const requireProductionSecret = (name, value) => {
  if (
    environment === 'production' &&
    (!value || PLACEHOLDER_SECRETS.has(value) || value.length < 32)
  ) {
    throw new Error(`${name} must be a non-placeholder secret of at least 32 characters in production.`);
  }
};

requireProductionSecret('JWT_SECRET', process.env.JWT_SECRET);

module.exports = Object.freeze({
  environment,
  isProduction: environment === 'production',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  financialLedgerDualWriteEnabled: parseBoolean(
    'FINANCIAL_LEDGER_DUAL_WRITE_ENABLED',
    process.env.FINANCIAL_LEDGER_DUAL_WRITE_ENABLED,
    false
  ),
});
