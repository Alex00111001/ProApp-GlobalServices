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
  registry,
  setOutboxDepth,
};
