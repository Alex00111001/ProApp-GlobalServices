const Prometheus = require('@prometheus-io/client');

const registry = new Prometheus.Registry();
registry.setDefaultLabels({ service: 'homeservices-core-api' });
Prometheus.collectDefaultMetrics({ register: registry, prefix: 'homeservices_' });

const httpRequests = new Prometheus.Counter({
  name: 'homeservices_http_requests_total',
  help: 'Completed HTTP requests by method, route template and status class.',
  labelNames: ['method', 'route', 'status_class'],
  registers: [registry],
});
const httpDuration = new Prometheus.Histogram({
  name: 'homeservices_http_request_duration_seconds',
  help: 'HTTP request latency by method, route template and status class.',
  labelNames: ['method', 'route', 'status_class'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});
const httpInFlight = new Prometheus.Gauge({
  name: 'homeservices_http_requests_in_flight',
  help: 'HTTP requests currently executing.',
  registers: [registry],
});
const dependencyChecks = new Prometheus.Counter({
  name: 'homeservices_dependency_checks_total',
  help: 'Dependency health checks by bounded dependency and result.',
  labelNames: ['dependency', 'status'],
  registers: [registry],
});
const dependencyDuration = new Prometheus.Histogram({
  name: 'homeservices_dependency_check_duration_seconds',
  help: 'Dependency health check latency.',
  labelNames: ['dependency'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});
const outboxDepth = new Prometheus.Gauge({
  name: 'homeservices_outbox_events',
  help: 'Current outbox depth by bounded status.',
  labelNames: ['status'],
  registers: [registry],
});
const externalOperations = new Prometheus.Counter({
  name: 'homeservices_external_operations_total',
  help: 'External provider operations by provider, operation and bounded outcome.',
  labelNames: ['provider', 'operation', 'outcome'],
  registers: [registry],
});
const privacyOperations = new Prometheus.Counter({
  name: 'homeservices_privacy_operations_total',
  help: 'Privacy decisions and enforcement by bounded operation and outcome.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});
const attributionOperations = new Prometheus.Counter({
  name: 'homeservices_attribution_operations_total',
  help: 'Attribution and touchpoint operations by bounded operation and outcome.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});
const referralOperations = new Prometheus.Counter({
  name: 'homeservices_referral_operations_total',
  help: 'Referral lifecycle operations by bounded operation and outcome.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});
const automationOperations = new Prometheus.Counter({
  name: 'homeservices_automation_operations_total',
  help: 'Automation trigger and execution outcomes.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});
const automationExecutionDuration = new Prometheus.Histogram({
  name: 'homeservices_automation_execution_duration_seconds',
  help: 'Automation execution latency without definition or subject labels.',
  labelNames: ['outcome'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});
const automationQueueAge = new Prometheus.Histogram({
  name: 'homeservices_automation_queue_age_seconds',
  help: 'Age of claimed durable automation work.',
  labelNames: ['queue'],
  buckets: [1, 5, 15, 30, 60, 300, 900, 3600, 21600],
  registers: [registry],
});
const marketOperations = new Prometheus.Counter({
  name: 'homeservices_market_operations_total',
  help: 'Market, policy, geography, identity and service-area outcomes with bounded non-PII labels.',
  labelNames: ['operation', 'market', 'outcome', 'reason'],
  registers: [registry],
});
const experimentOperations = new Prometheus.Counter({
  name: 'homeservices_experiment_operations_total',
  help: 'Experiment lifecycle, assignment, exposure and analysis outcomes with bounded labels.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});
const contentOperations = new Prometheus.Counter({
  name: 'homeservices_content_operations_total',
  help: 'Editorial and SEO lifecycle outcomes with bounded labels.',
  labelNames: ['operation', 'outcome', 'reason'],
  registers: [registry],
});

const boundedLabel = (value, fallback = 'unknown') => {
  const label = String(value || '').toLowerCase();
  return /^[a-z0-9_.:-]{1,80}$/.test(label) ? label : fallback;
};

const boundedRoute = (req) => {
  const route = req.route?.path;
  return route ? `${req.baseUrl || ''}${route}`.slice(0, 160) : 'unmatched';
};

const metricsMiddleware = (req, res, next) => {
  const started = process.hrtime.bigint();
  httpInFlight.inc();
  res.once('finish', () => {
    httpInFlight.dec();
    const labels = {
      method: req.method,
      route: boundedRoute(req),
      status_class: `${Math.floor(res.statusCode / 100)}xx`,
    };
    httpRequests.inc(labels);
    httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1_000_000_000);
  });
  next();
};

const observeDependency = ({ dependency, status, latencyMs }) => {
  dependencyChecks.inc({ dependency, status });
  dependencyDuration.observe({ dependency }, Math.max(0, latencyMs) / 1_000);
};

const setOutboxDepth = (counts) => {
  for (const status of ['PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER']) {
    outboxDepth.set({ status }, counts[status] || 0);
  }
};

const observeExternalOperation = ({ provider, operation, outcome }) => {
  externalOperations.inc({
    provider: boundedLabel(provider),
    operation: boundedLabel(operation),
    outcome: boundedLabel(outcome),
  });
};

const observePrivacyOperation = ({ operation, outcome, reason = 'none' }) => privacyOperations.inc({
  operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason),
});
const observeAttributionOperation = ({ operation, outcome, reason = 'none' }) => attributionOperations.inc({
  operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason),
});
const observeReferralOperation = ({ operation, outcome, reason = 'none' }) => referralOperations.inc({ operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason) });
const observeAutomationOperation = ({ operation, outcome, reason = 'none', durationSeconds, queueAgeSeconds, queue = 'delivery' }) => {
  automationOperations.inc({ operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason) });
  if (Number.isFinite(durationSeconds)) automationExecutionDuration.observe({ outcome: boundedLabel(outcome) }, Math.max(0, durationSeconds));
  if (Number.isFinite(queueAgeSeconds)) automationQueueAge.observe({ queue: boundedLabel(queue) }, Math.max(0, queueAgeSeconds));
};
const observeMarketOperation = ({ operation, market = 'unknown', outcome, reason = 'none' }) => marketOperations.inc({
  operation: boundedLabel(operation), market: boundedLabel(market), outcome: boundedLabel(outcome), reason: boundedLabel(reason),
});
const observeExperimentOperation = ({ operation, outcome, reason = 'none' }) => experimentOperations.inc({ operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason) });
const observeContentOperation = ({ operation, outcome, reason = 'none' }) => contentOperations.inc({ operation: boundedLabel(operation), outcome: boundedLabel(outcome), reason: boundedLabel(reason) });

const metricsHandler = async (req, res, next) => {
  try {
    res.set('content-type', registry.contentType);
    res.send(await registry.metrics());
  } catch (error) {
    next(error);
  }
};

module.exports = {
  boundedRoute,
  boundedLabel,
  metricsHandler,
  metricsMiddleware,
  observeDependency,
  observeExternalOperation,
  observePrivacyOperation,
  observeAttributionOperation,
  observeReferralOperation,
  observeAutomationOperation,
  observeMarketOperation,
  observeExperimentOperation,
  observeContentOperation,
  registry,
  setOutboxDepth,
};
