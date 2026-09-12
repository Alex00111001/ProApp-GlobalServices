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

const parseInteger = (name, value, fallback, minimum, maximum) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
};

const parseRatio = (name, value, fallback) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1.`);
  }
  return parsed;
};

const parseChoice = (name, value, fallback, allowed) => {
  const parsed = value || fallback;
  if (!allowed.includes(parsed)) throw new Error(`${name} must be one of: ${allowed.join(', ')}.`);
  return parsed;
};

const parseIdentifier = (name, value, fallback) => {
  const parsed = value || fallback;
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(parsed)) {
    throw new Error(`${name} must be a bounded operational identifier.`);
  }
  return parsed;
};

const parseHttpUrl = (name, value, required = false) => {
  if (!value) {
    if (required) throw new Error(`${name} must be configured.`);
    return undefined;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${name} must be a valid HTTP(S) URL.`);
  if (parsed.username || parsed.password) throw new Error(`${name} must not contain embedded credentials.`);
  return parsed.toString().replace(/\/$/, '');
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
  const otelEnabled = parseBoolean('OTEL_ENABLED', source.OTEL_ENABLED, false);
  const consentAttributionEnabled = parseBoolean('CONSENT_ATTRIBUTION_ENABLED', source.CONSENT_ATTRIBUTION_ENABLED, false);
  const referralsAutomationEnabled = parseBoolean('REFERRALS_AUTOMATION_ENABLED', source.REFERRALS_AUTOMATION_ENABLED, environment !== 'production');
  const referralsEnabled = parseBoolean('REFERRALS_ENABLED', source.REFERRALS_ENABLED, environment !== 'production');
  const automationEngineEnabled = parseBoolean('AUTOMATION_ENGINE_ENABLED', source.AUTOMATION_ENGINE_ENABLED, environment !== 'production');
  const marketsIdentityGeographyEnabled = parseBoolean('MARKETS_IDENTITY_GEOGRAPHY_ENABLED', source.MARKETS_IDENTITY_GEOGRAPHY_ENABLED, false);
  const experimentsContentSeoEnabled = parseBoolean('EXPERIMENTS_CONTENT_SEO_ENABLED', source.EXPERIMENTS_CONTENT_SEO_ENABLED, false);
  const experimentsEnabled = parseBoolean('EXPERIMENTS_ENABLED', source.EXPERIMENTS_ENABLED, false);
  const publicSeoEnabled = parseBoolean('PUBLIC_SEO_ENABLED', source.PUBLIC_SEO_ENABLED, false);
  const emailProvider = parseChoice('EMAIL_PROVIDER', source.EMAIL_PROVIDER, 'disabled', ['disabled', 'http']);
  const emailProviderUrl = parseHttpUrl('EMAIL_PROVIDER_URL', source.EMAIL_PROVIDER_URL, emailProvider === 'http');
  const accountActionBaseUrl = parseHttpUrl(
    'ACCOUNT_ACTION_BASE_URL',
    source.ACCOUNT_ACTION_BASE_URL || (environment === 'production' ? undefined : 'http://localhost:3001'),
    true
  );
  const contentWorkerEnabled = parseBoolean('CONTENT_WORKER_ENABLED', source.CONTENT_WORKER_ENABLED, false);
  const supplyDemandEnabled = parseBoolean('SUPPLY_DEMAND_ENABLED', source.SUPPLY_DEMAND_ENABLED, environment !== 'production');
  const aiOperationsEnabled = parseBoolean('AI_OPERATIONS_ENABLED', source.AI_OPERATIONS_ENABLED, environment !== 'production');
  const aiProviderExecutionEnabled = parseBoolean('AI_PROVIDER_EXECUTION_ENABLED', source.AI_PROVIDER_EXECUTION_ENABLED, false);
  const aiOperationsWorkerEnabled = parseBoolean('AI_OPERATIONS_WORKER_ENABLED', source.AI_OPERATIONS_WORKER_ENABLED, false);
  const cashPaymentEnabled = parseBoolean('CASH_PAYMENT_ENABLED', source.CASH_PAYMENT_ENABLED, false);
  if (aiProviderExecutionEnabled && !aiOperationsEnabled) throw new Error('AI_PROVIDER_EXECUTION_ENABLED requires AI_OPERATIONS_ENABLED.');
  if (aiOperationsWorkerEnabled && (!aiOperationsEnabled || !aiProviderExecutionEnabled)) throw new Error('AI_OPERATIONS_WORKER_ENABLED requires AI Operations and provider execution.');
  if (cashPaymentEnabled) {
    throw new Error('CASH_PAYMENT_ENABLED is quarantined and must remain false until a governed cash-settlement workflow is accepted.');
  }
  const logTransport = parseChoice('LOG_TRANSPORT', source.LOG_TRANSPORT, 'stdout', ['stdout', 'file']);
  const logLevel = parseChoice('LOG_LEVEL', source.LOG_LEVEL, environment === 'production' ? 'info' : 'debug', [
    'trace', 'debug', 'info', 'warn', 'error', 'fatal',
  ]);
  const otelExporterEndpoint = parseHttpUrl(
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    source.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelEnabled
  );
  const alertWebhookHighUrl = parseHttpUrl(
    'OBSERVABILITY_ALERT_WEBHOOK_HIGH_URL',
    source.OBSERVABILITY_ALERT_WEBHOOK_HIGH_URL,
    false
  );
  const alertWebhookCriticalUrl = parseHttpUrl(
    'OBSERVABILITY_ALERT_WEBHOOK_CRITICAL_URL',
    source.OBSERVABILITY_ALERT_WEBHOOK_CRITICAL_URL,
    false
  );
  const alertRouteHigh = parseIdentifier('OBSERVABILITY_ALERT_ROUTE_HIGH', source.OBSERVABILITY_ALERT_ROUTE_HIGH, 'operations-on-call');
  const alertRouteCritical = parseIdentifier('OBSERVABILITY_ALERT_ROUTE_CRITICAL', source.OBSERVABILITY_ALERT_ROUTE_CRITICAL, 'operations-critical');

  requireProductionSecret(environment, 'JWT_SECRET', jwtSecret);
  requireProductionSecret(environment, 'CUSTOMER_SESSION_PEPPER', source.CUSTOMER_SESSION_PEPPER);
  if (emailProvider === 'http') requireProductionSecret(environment, 'EMAIL_PROVIDER_API_KEY', source.EMAIL_PROVIDER_API_KEY);
  requireProductionSecret(environment, 'ADMIN_SESSION_PEPPER', source.ADMIN_SESSION_PEPPER);
  requireProductionSecret(environment, 'GROWTH_PSEUDONYM_SECRET', source.GROWTH_PSEUDONYM_SECRET);
  if (consentAttributionEnabled) requireProductionSecret(environment, 'GROWTH_IDENTITY_PROOF_SECRET', source.GROWTH_IDENTITY_PROOF_SECRET);
  if (marketsIdentityGeographyEnabled) {
    requireProductionSecret(environment, 'IDENTITY_DOCUMENT_LOOKUP_KEY', source.IDENTITY_DOCUMENT_LOOKUP_KEY);
    if (environment === 'production') {
      const encryptionKey = Buffer.from(source.IDENTITY_DOCUMENT_ENCRYPTION_KEY_BASE64 || '', 'base64');
      if (encryptionKey.length !== 32) throw new Error('IDENTITY_DOCUMENT_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes in production.');
    }
  }
  if (environment === 'production' && (experimentsContentSeoEnabled || experimentsEnabled)) {
    requireProductionSecret(environment, 'EXPERIMENT_ASSIGNMENT_SECRET', source.EXPERIMENT_ASSIGNMENT_SECRET);
  }

  if (environment === 'production') {
    if (emailProvider === 'disabled') throw new Error('EMAIL_PROVIDER must be configured in production.');
    if (!emailProviderUrl?.startsWith('https://')) throw new Error('EMAIL_PROVIDER_URL must use HTTPS in production.');
    if (!accountActionBaseUrl.startsWith('https://')) throw new Error('ACCOUNT_ACTION_BASE_URL must use HTTPS in production.');
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
    if (!otelEnabled) throw new Error('OTEL_ENABLED must be true in production.');
    if (!otelExporterEndpoint) throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must be configured.');
    if (!otelExporterEndpoint.startsWith('https://')) throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must use HTTPS in production.');
    if (!alertWebhookHighUrl || !alertWebhookCriticalUrl) {
      throw new Error('Observability alert webhooks must be configured in production.');
    }
    if (alertRouteHigh === alertRouteCritical) throw new Error('High and critical alert routes must be distinct in production.');
    if (!alertWebhookHighUrl.startsWith('https://') || !alertWebhookCriticalUrl.startsWith('https://')) {
      throw new Error('Observability alert webhooks must use HTTPS in production.');
    }
    requireProductionSecret(environment, 'OBSERVABILITY_ALERT_SIGNING_SECRET', source.OBSERVABILITY_ALERT_SIGNING_SECRET);
  }
  if (logTransport === 'file' && !source.LOG_FILE_PATH) {
    throw new Error('LOG_FILE_PATH must be configured when LOG_TRANSPORT=file.');
  }

  return {
    environment,
    isProduction: environment === 'production',
    port: parsePort(source.PORT),
    trustProxyHops: parseInteger('TRUST_PROXY_HOPS', source.TRUST_PROXY_HOPS, 0, 0, 5),
    corsOrigins,
    jwtSecret,
    jwtExpiresIn: source.JWT_EXPIRES_IN || '7d',
    customerAccessTokenMinutes: parseInteger('CUSTOMER_ACCESS_TOKEN_MINUTES', source.CUSTOMER_ACCESS_TOKEN_MINUTES, 15, 5, 30),
    customerSessionHours: parseInteger('CUSTOMER_SESSION_HOURS', source.CUSTOMER_SESSION_HOURS, 720, 1, 2_160),
    customerSessionPepper: source.CUSTOMER_SESSION_PEPPER || jwtSecret,
    allowLegacyCustomerJwt: parseBoolean('ALLOW_LEGACY_CUSTOMER_JWT', source.ALLOW_LEGACY_CUSTOMER_JWT, environment !== 'production'),
    authRateLimitWindowMinutes: parseInteger('AUTH_RATE_LIMIT_WINDOW_MINUTES', source.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15, 1, 1_440),
    authLoginRateLimit: parseInteger('AUTH_LOGIN_RATE_LIMIT', source.AUTH_LOGIN_RATE_LIMIT, 10, 1, 1_000),
    authRegisterRateLimit: parseInteger('AUTH_REGISTER_RATE_LIMIT', source.AUTH_REGISTER_RATE_LIMIT, 5, 1, 1_000),
    passwordResetTokenMinutes: parseInteger('PASSWORD_RESET_TOKEN_MINUTES', source.PASSWORD_RESET_TOKEN_MINUTES, 30, 5, 180),
    emailVerificationTokenHours: parseInteger('EMAIL_VERIFICATION_TOKEN_HOURS', source.EMAIL_VERIFICATION_TOKEN_HOURS, 24, 1, 168),
    accountActionBaseUrl,
    emailProvider,
    emailProviderUrl,
    emailProviderApiKey: source.EMAIL_PROVIDER_API_KEY,
    databaseTransactionMaxWaitMs: parseInteger(
      'DATABASE_TRANSACTION_MAX_WAIT_MS',
      source.DATABASE_TRANSACTION_MAX_WAIT_MS,
      10_000,
      1_000,
      60_000
    ),
    databaseTransactionTimeoutMs: parseInteger(
      'DATABASE_TRANSACTION_TIMEOUT_MS',
      source.DATABASE_TRANSACTION_TIMEOUT_MS,
      10_000,
      1_000,
      60_000
    ),
    bookingIdempotencyTtlHours: parseInteger(
      'BOOKING_IDEMPOTENCY_TTL_HOURS',
      source.BOOKING_IDEMPOTENCY_TTL_HOURS,
      24,
      1,
      168
    ),
    adminAccessTokenMinutes: parseInteger('ADMIN_ACCESS_TOKEN_MINUTES', source.ADMIN_ACCESS_TOKEN_MINUTES, 15, 5, 30),
    adminSessionHours: parseInteger('ADMIN_SESSION_HOURS', source.ADMIN_SESSION_HOURS, 12, 1, 168),
    adminSessionPepper: source.ADMIN_SESSION_PEPPER || jwtSecret,
    adminRoleChangesEnabled: parseBoolean('ADMIN_ROLE_CHANGES_ENABLED', source.ADMIN_ROLE_CHANGES_ENABLED, false),
    growthDataEnabled: parseBoolean('GROWTH_DATA_ENABLED', source.GROWTH_DATA_ENABLED, environment !== 'production'),
    growthPseudonymSecret: source.GROWTH_PSEUDONYM_SECRET || 'development-only-growth-pseudonym-secret',
    consentAttributionEnabled,
    referralsAutomationEnabled,
    referralsEnabled: referralsAutomationEnabled || referralsEnabled,
    automationEngineEnabled: referralsAutomationEnabled || automationEngineEnabled,
    referralRewardFulfillmentEnabled: parseBoolean('REFERRAL_REWARD_FULFILLMENT_ENABLED', source.REFERRAL_REWARD_FULFILLMENT_ENABLED, false),
    automationWorkerEnabled: parseBoolean('AUTOMATION_WORKER_ENABLED', source.AUTOMATION_WORKER_ENABLED, false),
    automationManualReplayEnabled: parseBoolean('AUTOMATION_MANUAL_REPLAY_ENABLED', source.AUTOMATION_MANUAL_REPLAY_ENABLED, false),
    automationWorkerPollMs: parseInteger('AUTOMATION_WORKER_POLL_MS', source.AUTOMATION_WORKER_POLL_MS, 1_000, 100, 60_000),
    automationWorkerBatchSize: parseInteger('AUTOMATION_WORKER_BATCH_SIZE', source.AUTOMATION_WORKER_BATCH_SIZE, 25, 1, 100),
    marketsIdentityGeographyEnabled,
    experimentsContentSeoEnabled,
    experimentsEnabled: experimentsContentSeoEnabled || experimentsEnabled,
    contentPublishingEnabled: experimentsContentSeoEnabled || parseBoolean('CONTENT_PUBLISHING_ENABLED', source.CONTENT_PUBLISHING_ENABLED, false),
    publicSeoEnabled: experimentsContentSeoEnabled || publicSeoEnabled,
    contentWorkerEnabled,
    contentWorkerPollMs: parseInteger('CONTENT_WORKER_POLL_MS', source.CONTENT_WORKER_POLL_MS, 5_000, 500, 60_000),
    supplyDemandEnabled,
    aiOperationsEnabled,
    aiProviderExecutionEnabled,
    aiOperationsWorkerEnabled,
    aiOperationsWorkerPollMs: parseInteger('AI_OPERATIONS_WORKER_POLL_MS', source.AI_OPERATIONS_WORKER_POLL_MS, 2_000, 250, 60_000),
    aiOperationsWorkerBatchSize: parseInteger('AI_OPERATIONS_WORKER_BATCH_SIZE', source.AI_OPERATIONS_WORKER_BATCH_SIZE, 10, 1, 50),
    aiOperationsHourlyBudgetMicros: parseInteger('AI_OPERATIONS_HOURLY_BUDGET_MICROS', source.AI_OPERATIONS_HOURLY_BUDGET_MICROS, 5_000_000, 0, 2_000_000_000),
    aiOperationsDailyBudgetMicros: parseInteger('AI_OPERATIONS_DAILY_BUDGET_MICROS', source.AI_OPERATIONS_DAILY_BUDGET_MICROS, 25_000_000, 0, 2_000_000_000),
    aiOperationsMonthlyBudgetMicros: parseInteger('AI_OPERATIONS_MONTHLY_BUDGET_MICROS', source.AI_OPERATIONS_MONTHLY_BUDGET_MICROS, 250_000_000, 0, 2_000_000_000),
    experimentAssignmentSecret: source.EXPERIMENT_ASSIGNMENT_SECRET || 'development-only-experiment-assignment-secret',
    publicWebBaseUrl: parseHttpUrl('PUBLIC_WEB_BASE_URL', source.PUBLIC_WEB_BASE_URL, environment === 'production' && publicSeoEnabled),
    identityDocumentEncryptionKeyBase64: source.IDENTITY_DOCUMENT_ENCRYPTION_KEY_BASE64,
    identityDocumentEncryptionKeyVersion: parseIdentifier('IDENTITY_DOCUMENT_ENCRYPTION_KEY_VERSION', source.IDENTITY_DOCUMENT_ENCRYPTION_KEY_VERSION, 'development-v1'),
    identityDocumentLookupKey: source.IDENTITY_DOCUMENT_LOOKUP_KEY || 'development-only-identity-lookup-key',
    growthIdentityProofSecret: source.GROWTH_IDENTITY_PROOF_SECRET || 'development-only-growth-identity-proof-secret',
    identityProofTtlHours: parseInteger('IDENTITY_PROOF_TTL_HOURS', source.IDENTITY_PROOF_TTL_HOURS, 24, 1, 168),
    logLevel,
    logTransport,
    logFilePath: source.LOG_FILE_PATH,
    otelEnabled,
    otelExporterEndpoint,
    otelTraceSampleRatio: parseRatio('OTEL_TRACE_SAMPLE_RATIO', source.OTEL_TRACE_SAMPLE_RATIO, environment === 'production' ? 0.1 : 1),
    observabilityErrorWindowMinutes: parseInteger('OBSERVABILITY_ERROR_WINDOW_MINUTES', source.OBSERVABILITY_ERROR_WINDOW_MINUTES, 5, 1, 60),
    observabilityIncidentThreshold: parseInteger('OBSERVABILITY_INCIDENT_THRESHOLD', source.OBSERVABILITY_INCIDENT_THRESHOLD, 20, 1, 10_000),
    observabilityAlertMinSeverity: parseChoice('OBSERVABILITY_ALERT_MIN_SEVERITY', source.OBSERVABILITY_ALERT_MIN_SEVERITY, 'HIGH', ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    observabilityAlertRouteHigh: alertRouteHigh,
    observabilityAlertRouteCritical: alertRouteCritical,
    observabilityAlertWebhookHighUrl: alertWebhookHighUrl,
    observabilityAlertWebhookCriticalUrl: alertWebhookCriticalUrl,
    observabilityAlertSigningSecret: source.OBSERVABILITY_ALERT_SIGNING_SECRET,
    observabilityHealthTimeoutMs: parseInteger('OBSERVABILITY_HEALTH_TIMEOUT_MS', source.OBSERVABILITY_HEALTH_TIMEOUT_MS, 2_000, 100, 30_000),
    observabilityRetentionDays: parseInteger('OBSERVABILITY_RETENTION_DAYS', source.OBSERVABILITY_RETENTION_DAYS, 30, 1, 365),
    observabilityAuditRetentionDays: parseInteger('OBSERVABILITY_AUDIT_RETENTION_DAYS', source.OBSERVABILITY_AUDIT_RETENTION_DAYS, 365, 30, 2_555),
    observabilityWorkerPollMs: parseInteger('OBSERVABILITY_WORKER_POLL_MS', source.OBSERVABILITY_WORKER_POLL_MS, 1_000, 100, 60_000),
    financialLedgerDualWriteEnabled: parseBoolean('FINANCIAL_LEDGER_DUAL_WRITE_ENABLED', source.FINANCIAL_LEDGER_DUAL_WRITE_ENABLED, false),
    financialRefundRequestsEnabled: parseBoolean('FINANCIAL_REFUND_REQUESTS_ENABLED', source.FINANCIAL_REFUND_REQUESTS_ENABLED, false),
    financialRefundExecutionEnabled: parseBoolean('FINANCIAL_REFUND_EXECUTION_ENABLED', source.FINANCIAL_REFUND_EXECUTION_ENABLED, false),
    financialPayoutRequestsEnabled: parseBoolean('FINANCIAL_PAYOUT_REQUESTS_ENABLED', source.FINANCIAL_PAYOUT_REQUESTS_ENABLED, false),
    financialPayoutExecutionEnabled: parseBoolean('FINANCIAL_PAYOUT_EXECUTION_ENABLED', source.FINANCIAL_PAYOUT_EXECUTION_ENABLED, false),
    financialDisputeRecoveryEnabled: parseBoolean('FINANCIAL_DISPUTE_RECOVERY_ENABLED', source.FINANCIAL_DISPUTE_RECOVERY_ENABLED, false),
    financialReconciliationEnabled: parseBoolean('FINANCIAL_RECONCILIATION_ENABLED', source.FINANCIAL_RECONCILIATION_ENABLED, false),
    cashPaymentEnabled,
  };
};

module.exports = Object.freeze({
  ...validateEnvironment(process.env),
  parseBoolean,
  parseChoice,
  parseCorsOrigins,
  parseHttpUrl,
  parseInteger,
  parseIdentifier,
  parsePort,
  parseRatio,
  validateEnvironment,
});
