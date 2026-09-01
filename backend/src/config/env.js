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
    corsOrigins,
    jwtSecret,
    jwtExpiresIn: source.JWT_EXPIRES_IN || '7d',
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
