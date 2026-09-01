const { createHmac } = require('node:crypto');
const env = require('../../config/env');
const { sanitizeTelemetry } = require('./redaction');

const SEVERITY_RANK = Object.freeze({ INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 });

const shouldAlert = (severity) => SEVERITY_RANK[severity] >= SEVERITY_RANK[env.observabilityAlertMinSeverity];

const routeForSeverity = (severity) => severity === 'CRITICAL'
  ? env.observabilityAlertRouteCritical
  : env.observabilityAlertRouteHigh;

const buildAlertRequest = (incident, context = {}) => {
  if (!shouldAlert(incident.severity)) return null;
  const route = routeForSeverity(incident.severity);
  return {
    payload: {
      schemaVersion: 1,
      incidentId: incident.id,
      severity: incident.severity,
      service: incident.service,
      status: incident.status,
      route,
      detectedAt: incident.detectedAt,
    },
    metadata: sanitizeTelemetry({
      deduplicationKey: incident.deduplicationKey,
      route,
      correlationId: context.correlationId,
      requestId: context.requestId,
      traceId: context.traceId,
    }),
  };
};

const createWebhookAlertAdapter = ({ url, signingSecret, fetchImpl = globalThis.fetch }) => {
  const endpoint = new URL(url);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Alert webhook URL must use HTTP(S)');
  if (typeof signingSecret !== 'string' || signingSecret.length < 32) {
    throw new Error('Alert webhook signing secret must contain at least 32 characters');
  }
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');

  return async (alert) => {
    const body = JSON.stringify(sanitizeTelemetry(alert));
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-homeservices-alert-timestamp': timestamp,
        'x-homeservices-alert-signature': `v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(env.observabilityHealthTimeoutMs * 2),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Alert destination returned HTTP ${response.status}`), {
        code: 'ALERT_DELIVERY_FAILED',
        retryable: response.status >= 429,
      });
    }
  };
};

const dispatchAlert = async (alert, adapters) => {
  const adapter = adapters?.[alert.route];
  if (typeof adapter !== 'function') {
    throw Object.assign(new Error(`No alert adapter configured for route ${alert.route}`), {
      code: 'ALERT_ROUTE_NOT_CONFIGURED',
      retryable: false,
    });
  }
  await adapter(alert);
};

const createConfiguredAlertAdapters = () => {
  if (!env.observabilityAlertWebhookHighUrl || !env.observabilityAlertWebhookCriticalUrl) return {};
  return {
    [env.observabilityAlertRouteHigh]: createWebhookAlertAdapter({
      url: env.observabilityAlertWebhookHighUrl,
      signingSecret: env.observabilityAlertSigningSecret,
    }),
    [env.observabilityAlertRouteCritical]: createWebhookAlertAdapter({
      url: env.observabilityAlertWebhookCriticalUrl,
      signingSecret: env.observabilityAlertSigningSecret,
    }),
  };
};

module.exports = {
  SEVERITY_RANK,
  buildAlertRequest,
  createConfiguredAlertAdapters,
  createWebhookAlertAdapter,
  dispatchAlert,
  routeForSeverity,
  shouldAlert,
};
