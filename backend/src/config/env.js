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

const stripeApiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
if (environment === 'production') {
  if (!stripeApiKey || !/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(stripeApiKey)) {
    throw new Error('STRIPE_API_KEY must be a live secret or restricted key in production.');
  }
  if (!/^whsec_[A-Za-z0-9]+$/.test(process.env.STRIPE_WEBHOOK_SECRET_CURRENT || process.env.STRIPE_WEBHOOK_SECRET || '')) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be configured in production.');
  }
}

const financialPayoutRequestsEnabled = parseBoolean(
  'FINANCIAL_PAYOUT_REQUESTS_ENABLED',
  process.env.FINANCIAL_PAYOUT_REQUESTS_ENABLED,
  false
);
const financialPayoutExecutionEnabled = parseBoolean(
  'FINANCIAL_PAYOUT_EXECUTION_ENABLED',
  process.env.FINANCIAL_PAYOUT_EXECUTION_ENABLED,
  false
);
const financialDisputeRecoveryEnabled = parseBoolean(
  'FINANCIAL_DISPUTE_RECOVERY_ENABLED',
  process.env.FINANCIAL_DISPUTE_RECOVERY_ENABLED,
  false
);
const financialReconciliationEnabled = parseBoolean(
  'FINANCIAL_RECONCILIATION_ENABLED',
  process.env.FINANCIAL_RECONCILIATION_ENABLED,
  false
);

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
  financialRefundRequestsEnabled: parseBoolean(
    'FINANCIAL_REFUND_REQUESTS_ENABLED',
    process.env.FINANCIAL_REFUND_REQUESTS_ENABLED,
    false
  ),
  financialRefundExecutionEnabled: parseBoolean(
    'FINANCIAL_REFUND_EXECUTION_ENABLED',
    process.env.FINANCIAL_REFUND_EXECUTION_ENABLED,
    false
  ),
  financialPayoutRequestsEnabled,
  financialPayoutExecutionEnabled,
  financialDisputeRecoveryEnabled,
  financialReconciliationEnabled,
});
