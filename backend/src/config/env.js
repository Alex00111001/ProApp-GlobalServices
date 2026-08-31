const PLACEHOLDER_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'change-me',
  'secret',
]);

const parseBoolean = (name, value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be either true or false.`);
};

const parsePort = (value) => {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
};

const parseCorsOrigins = (value) => {
  const origins = String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*' || origin === 'null') {
      throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins.');
    }
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return Object.freeze([...new Set(origins)]);
};

const requireProductionSecret = (environment, name, value) => {
  if (
    environment === 'production' &&
    (!value || PLACEHOLDER_SECRETS.has(value) || value.length < 32)
  ) {
    throw new Error(`${name} must be a non-placeholder secret of at least 32 characters in production.`);
  }
};

const validateEnvironment = (source = process.env) => {
  const environment = source.NODE_ENV || 'development';
  const corsOrigins = parseCorsOrigins(source.CORS_ORIGINS);
  const jwtSecret = source.JWT_SECRET || 'your-secret-key-change-in-production';
  const stripeApiKey = source.STRIPE_API_KEY || source.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = source.STRIPE_WEBHOOK_SECRET_CURRENT || source.STRIPE_WEBHOOK_SECRET;

  requireProductionSecret(environment, 'JWT_SECRET', jwtSecret);

  if (environment === 'production') {
    if (!/^postgres(?:ql)?:\/\//.test(source.DATABASE_URL || '')) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL in production.');
    }
    if (corsOrigins.length === 0) {
      throw new Error('CORS_ORIGINS must contain at least one explicit origin in production.');
    }
    if (!stripeApiKey || !/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(stripeApiKey)) {
      throw new Error('STRIPE_API_KEY must be a live secret or restricted key in production.');
    }
    if (!/^whsec_[A-Za-z0-9]+$/.test(stripeWebhookSecret || '')) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be configured in production.');
    }
  }

  return {
    environment,
    isProduction: environment === 'production',
    port: parsePort(source.PORT),
    corsOrigins,
    jwtSecret,
    jwtExpiresIn: source.JWT_EXPIRES_IN || '7d',
    financialLedgerDualWriteEnabled: parseBoolean('FINANCIAL_LEDGER_DUAL_WRITE_ENABLED', source.FINANCIAL_LEDGER_DUAL_WRITE_ENABLED, false),
    financialRefundRequestsEnabled: parseBoolean('FINANCIAL_REFUND_REQUESTS_ENABLED', source.FINANCIAL_REFUND_REQUESTS_ENABLED, false),
    financialRefundExecutionEnabled: parseBoolean('FINANCIAL_REFUND_EXECUTION_ENABLED', source.FINANCIAL_REFUND_EXECUTION_ENABLED, false),
    financialPayoutRequestsEnabled: parseBoolean('FINANCIAL_PAYOUT_REQUESTS_ENABLED', source.FINANCIAL_PAYOUT_REQUESTS_ENABLED, false),
    financialPayoutExecutionEnabled: parseBoolean('FINANCIAL_PAYOUT_EXECUTION_ENABLED', source.FINANCIAL_PAYOUT_EXECUTION_ENABLED, false),
    financialDisputeRecoveryEnabled: parseBoolean('FINANCIAL_DISPUTE_RECOVERY_ENABLED', source.FINANCIAL_DISPUTE_RECOVERY_ENABLED, false),
    financialReconciliationEnabled: parseBoolean('FINANCIAL_RECONCILIATION_ENABLED', source.FINANCIAL_RECONCILIATION_ENABLED, false),
  };
};

module.exports = Object.freeze({
  ...validateEnvironment(process.env),
  parseBoolean,
  parseCorsOrigins,
  parsePort,
  validateEnvironment,
});
